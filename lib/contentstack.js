const { getEnv, requireEnv } = require("./env")
const { fetchJson } = require("./utils")

function cmaBaseUrl() {
	return (getEnv("CONTENTSTACK_CMA_BASE_URL", "https://api.contentstack.io") || "https://api.contentstack.io").replace(/\/$/, "")
}

function cdaBaseUrl() {
	return (getEnv("CONTENTSTACK_CDA_BASE_URL", "https://cdn.contentstack.io") || "https://cdn.contentstack.io").replace(/\/$/, "")
}

async function fetchDraftEntry({ contentTypeUid, entryUid, locale }) {
	const apiKey = requireEnv("CONTENTSTACK_API_KEY")
	const managementToken = requireEnv("CONTENTSTACK_MANAGEMENT_TOKEN")

	const url = new URL(`${cmaBaseUrl()}/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`)
	if (locale) url.searchParams.set("locale", locale)

	return await fetchJson(url.toString(), {
		method: "GET",
		headers: {
			api_key: apiKey,
			authorization: managementToken,
			accept: "application/json",
		},
	})
}

async function fetchPublishedEntry({ contentTypeUid, entryUid, locale }) {
	const apiKey = requireEnv("CONTENTSTACK_API_KEY")
	const deliveryToken = requireEnv("CONTENTSTACK_DELIVERY_TOKEN")
	const environment = requireEnv("CONTENTSTACK_ENVIRONMENT")

	const url = new URL(`${cdaBaseUrl()}/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`)
	url.searchParams.set("environment", environment)
	if (locale) url.searchParams.set("locale", locale)

	return await fetchJson(url.toString(), {
		method: "GET",
		headers: {
			api_key: apiKey,
			access_token: deliveryToken,
			accept: "application/json",
		},
	})
}

async function localizeEntry({ contentTypeUid, entryUid, localeCode, entryPatch }) {
	const apiKey = requireEnv("CONTENTSTACK_API_KEY")
	const managementToken = requireEnv("CONTENTSTACK_MANAGEMENT_TOKEN")

	const url = new URL(`${cmaBaseUrl()}/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`)
	url.searchParams.set("locale", localeCode)

	return await fetchJson(url.toString(), {
		method: "PUT",
		headers: {
			api_key: apiKey,
			authorization: managementToken,
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({ entry: entryPatch }),
	})
}

async function setEntryWorkflowStage({ contentTypeUid, entryUid, localeCode, workflowStageUid, comment }) {
	const apiKey = requireEnv("CONTENTSTACK_API_KEY")
	const managementToken = requireEnv("CONTENTSTACK_MANAGEMENT_TOKEN")

	const url = new URL(
		`${cmaBaseUrl()}/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}/workflow`
	)
	url.searchParams.set("locale", localeCode)

	return await fetchJson(url.toString(), {
		method: "POST",
		headers: {
			api_key: apiKey,
			authorization: managementToken,
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({
			workflow: {
				workflow_stage: {
					comment,
					uid: workflowStageUid,
				},
			},
		}),
	})
}

module.exports = {
	fetchDraftEntry,
	fetchPublishedEntry,
	localizeEntry,
	setEntryWorkflowStage,
}

