const http = require("node:http")

const { loadDotEnv, getEnv, getEnvCsv, getEnvInt, requireEnv } = require("./lib/env")
const { json, truncate, redactHeaders, asNonEmptyString, toSmartlingLocaleId, toContentstackLocaleCode, formatDateForComment } =
	require("./lib/utils")
const { extractContentstackWorkflowIds } = require("./lib/webhook")
const { diffLeafValues, stripTopLevelSystemFields } = require("./lib/diff")
const { fetchDraftEntry, fetchPublishedEntry, localizeEntry, setEntryWorkflowStage } = require("./lib/contentstack")
const { mtTranslate } = require("./lib/smartling")
const { diffToSmartlingItems, buildEntryPatchFromChangedFields } = require("./lib/entryPatch")

loadDotEnv()

const PORT = getEnvInt("PORT", 3000, { min: 1 })
const CONTENTSTACK_TRANSLATION_REVIEW_STAGE_UID = requireEnv("CONTENTSTACK_TRANSLATION_REVIEW_STAGE_UID")

let reqId = 0

async function translateDiffWithSmartlingAndLocalize({ id, sourceLocaleId, targetLocaleIds, changedFields, ctx }) {
	const items = diffToSmartlingItems(changedFields)
	if (items.length === 0) {
		console.log(`[${id}] smartling: no translatable string changes (skipping)`)
		return
	}

	console.log(`[${id}] smartling: translating ${items.length} strings to ${targetLocaleIds.length} locales`)

	for (const targetLocaleId of targetLocaleIds) {
		try {
			const data = await mtTranslate({ sourceLocaleId, targetLocaleId, items })
			const translatedItems = Array.isArray(data?.items) ? data.items : []
			const translations = {}
			for (const it of translatedItems) {
				const k = it?.key
				const t = it?.translationText
				if (typeof k === "string" && typeof t === "string") translations[k] = t
			}

			console.log(`[${id}] smartling translation locale=${targetLocaleId}: ${truncate(JSON.stringify(translations, null, 2))}`)

			const localeCode = toContentstackLocaleCode(targetLocaleId)
			const entryPatch = buildEntryPatchFromChangedFields({ changedFields, translations })

			if (!Object.keys(entryPatch).length) {
				console.log(`[${id}] contentstack localize skipped locale=${localeCode} reason=empty_entry_patch`)
				continue
			}

			console.log(`[${id}] contentstack localize locale=${localeCode} payload: ${truncate(JSON.stringify({ entry: entryPatch }, null, 2))}`)
			const updated = await localizeEntry({
				contentTypeUid: ctx.contentTypeUid,
				entryUid: ctx.entryUid,
				localeCode,
				entryPatch,
			})
			console.log(`[${id}] contentstack localized locale=${localeCode} result: ${truncate(JSON.stringify(updated?.entry ?? updated, null, 2))}`)

			const ver = typeof ctx.draftVersion === "number" && Number.isFinite(ctx.draftVersion) ? ctx.draftVersion : "unknown"
			const comment = `Translated from Smartling on ${formatDateForComment()} from version ${ver}`
			console.log(
				`[${id}] contentstack workflow locale=${localeCode} stage=${CONTENTSTACK_TRANSLATION_REVIEW_STAGE_UID} comment=${JSON.stringify(
					comment
				)}`
			)
			const wfRes = await setEntryWorkflowStage({
				contentTypeUid: ctx.contentTypeUid,
				entryUid: ctx.entryUid,
				localeCode,
				workflowStageUid: CONTENTSTACK_TRANSLATION_REVIEW_STAGE_UID,
				comment,
			})
			console.log(`[${id}] contentstack workflow updated locale=${localeCode} result: ${truncate(JSON.stringify(wfRes, null, 2))}`)

			const callbackUrl = (getEnv("SMARTLING_CALLBACK_URL", "") || "").trim()
			if (callbackUrl) {
				// Best-effort; failures shouldn't break localization.
				fetch(callbackUrl, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ ...ctx, sourceLocaleId, targetLocaleId, translations }),
				}).catch((e) => console.log(`[${id}] smartling callback post failed url=${callbackUrl} err=${e instanceof Error ? e.message : "unknown"}`))
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error"
			console.log(`[${id}] smartling/contentstack pipeline failed locale=${targetLocaleId} err=${msg}`)
		}
	}
}

const server = http.createServer(async (req, res) => {
	const id = ++reqId
	const startedAt = Date.now()

	const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
	const method = (req.method || "GET").toUpperCase()

	const chunks = []
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	const body = Buffer.concat(chunks)
	const bodyText = body.length ? body.toString("utf8") : ""

	console.log(`[${id}] --> ${method} ${url.pathname}${url.search}`)
	console.log(`[${id}] headers: ${JSON.stringify(redactHeaders(req.headers), null, 2)}`)
	if (bodyText) console.log(`[${id}] body: ${truncate(bodyText)}`)

	if (method === "GET" && url.pathname === "/healthz") {
		console.log(`[${id}] action=healthz`)
		return json(res, 200, { ok: true })
	}

	if (method === "POST" && url.pathname === "/smartling/callback") {
		console.log(`[${id}] action=smartling.callback`)
		if (!bodyText) return json(res, 400, { ok: false, error: "Expected JSON body" })
		try {
			const payload = JSON.parse(bodyText)
			console.log(`[${id}] smartling callback payload: ${truncate(JSON.stringify(payload, null, 2))}`)
			return json(res, 200, { ok: true })
		} catch {
			return json(res, 400, { ok: false, error: "Invalid JSON body" })
		}
	}

	if (method === "POST" && url.pathname === "/webhook") {
		console.log(`[${id}] action=webhook`)

		if (!bodyText) {
			console.log(`[${id}] action=webhook rejected reason=empty_body`)
			return json(res, 400, { ok: false, error: "Expected JSON body" })
		}

		let payload
		try {
			payload = JSON.parse(bodyText)
		} catch {
			console.log(`[${id}] action=webhook rejected reason=invalid_json`)
			return json(res, 400, { ok: false, error: "Invalid JSON body" })
		}

		console.log(`[${id}] payload: ${truncate(JSON.stringify(payload, null, 2))}`)

		const ids = extractContentstackWorkflowIds(payload)
		if (!ids || ids.module !== "workflow") {
			console.log(`[${id}] action=webhook rejected reason=unsupported_payload`)
			return json(res, 400, { ok: false, error: "Unsupported payload: expected Contentstack workflow webhook" })
		}

		const incomingEvent = asNonEmptyString(payload?.event) || ids.event || "update"
		const triggeredAt = asNonEmptyString(payload?.triggered_at) || ""
		console.log(`[${id}] incoming webhook event module=workflow event=${incomingEvent}` + (triggeredAt ? ` triggered_at=${triggeredAt}` : ""))
		console.log(
			`[${id}] action=contentstack.workflow_stage_change contentTypeUid=${ids.contentTypeUid} entryUid=${ids.entryUid}` +
				(ids.locale ? ` locale=${ids.locale}` : "")
		)

		const locale = ids.locale || "en-us"

		try {
			const [draftRes, publishedRes] = await Promise.all([
				fetchDraftEntry({ contentTypeUid: ids.contentTypeUid, entryUid: ids.entryUid, locale }),
				fetchPublishedEntry({ contentTypeUid: ids.contentTypeUid, entryUid: ids.entryUid, locale }),
			])

			console.log(`[${id}] fetch draft result: ${truncate(JSON.stringify(draftRes?.entry ?? null, null, 2))}`)
			console.log(`[${id}] fetch published result: ${truncate(JSON.stringify(publishedRes?.entry ?? null, null, 2))}`)

			const draftEntryRaw = draftRes?.entry ?? {}
			const publishedEntryRaw = publishedRes?.entry ?? {}

			const draftVersionRaw = draftEntryRaw?._version ?? draftEntryRaw?.version
			const draftVersion = Number.isFinite(Number(draftVersionRaw)) ? Number(draftVersionRaw) : undefined

			const draftEntry = stripTopLevelSystemFields(draftEntryRaw)
			const publishedEntry = stripTopLevelSystemFields(publishedEntryRaw)

			const changes = diffLeafValues(publishedEntry, draftEntry).filter((c) => c.path)
			const changedFields = changes.map((c) => ({ [c.path]: c.after }))

			console.log(`[${id}] action=diff changedFields=${changedFields.length}`)
			console.log(`[${id}] diff: ${truncate(JSON.stringify(changedFields, null, 2))}`)

			const smartlingTargetLocaleIds = getEnvCsv("SMARTLING_TARGET_LOCALE_IDS")
			if (changedFields.length === 0) {
				console.log(`[${id}] smartling: diff empty (skipping)`)
			} else if (smartlingTargetLocaleIds.length) {
				const smartlingSourceLocaleId = (getEnv("SMARTLING_SOURCE_LOCALE_ID", "") || "").trim() || toSmartlingLocaleId(locale)
				translateDiffWithSmartlingAndLocalize({
					id,
					sourceLocaleId: smartlingSourceLocaleId,
					targetLocaleIds: smartlingTargetLocaleIds,
					changedFields,
					ctx: {
						contentTypeUid: ids.contentTypeUid,
						entryUid: ids.entryUid,
						contentstackLocale: locale,
						draftVersion,
					},
				}).catch((e) => console.log(`[${id}] smartling translation unexpected error: ${e instanceof Error ? e.message : "unknown"}`))
			} else {
				console.log(`[${id}] smartling: SMARTLING_TARGET_LOCALE_IDS not set (skipping)`)
			}

			const elapsedMs = Date.now() - startedAt
			console.log(`[${id}] <-- 200 action=contentstack.workflow_stage_change ${elapsedMs}ms`)
			return json(res, 200, { ok: true, received: true, extracted: ids, locale, changedFields })
		} catch (e) {
			const message = e instanceof Error ? e.message : "Unknown error"
			const status = typeof e?.status === "number" ? e.status : 502
			const bodyText2 = typeof e?.bodyText === "string" ? e.bodyText : undefined
			const url2 = typeof e?.url === "string" ? e.url : undefined
			console.log(`[${id}] action=contentstack.fetch_error status=${status} message=${message}`)
			return json(res, status, { ok: false, error: message, ...(url2 ? { url: url2 } : {}), ...(bodyText2 ? { bodyText: bodyText2 } : {}) })
		}
	}

	console.log(`[${id}] action=not_found`)
	return json(res, 404, { ok: false, error: "Not found" })
})

server.listen(PORT, () => {
	console.log(`listening on http://localhost:${PORT}`)
	console.log(`webhook endpoint: POST http://localhost:${PORT}/webhook`)
})