const { getEnvInt } = require("./env")

function json(res, statusCode, obj) {
	res.statusCode = statusCode
	res.setHeader("content-type", "application/json")
	res.end(JSON.stringify(obj))
}

function truncate(s, max = undefined) {
	const limit = typeof max === "number" ? max : getEnvInt("LOG_TRUNCATE_MAX", 20000, { min: 1000 })
	if (s.length <= limit) return s
	return `${s.slice(0, limit)}… (truncated, ${s.length} chars total)`
}

function redactHeaders(headers) {
	const out = {}
	for (const [k, v] of Object.entries(headers || {})) {
		const key = String(k).toLowerCase()
		if (key === "authorization" || key === "cookie" || key === "set-cookie" || key === "x-webhook-secret") {
			out[k] = "[redacted]"
		} else {
			out[k] = v
		}
	}
	return out
}

function getPath(obj, path) {
	let cur = obj
	for (const key of path) {
		if (!cur || (typeof cur !== "object" && typeof cur !== "function")) return undefined
		cur = cur[key]
	}
	return cur
}

function asNonEmptyString(v) {
	return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function toSmartlingLocaleId(locale) {
	const raw = String(locale || "").trim()
	if (!raw) return ""
	if (!raw.includes("-")) return raw // e.g. "ar"
	const [lang, region] = raw.split("-", 2)
	return `${lang.toLowerCase()}-${region.toUpperCase()}`
}

function toContentstackLocaleCode(localeId) {
	const raw = String(localeId || "").trim()
	if (!raw) return ""
	if (!raw.includes("-")) return raw.toLowerCase()
	const [lang, region] = raw.split("-", 2)
	return `${lang.toLowerCase()}-${region.toLowerCase()}`
}

function setDeep(obj, pathParts, value) {
	if (!obj || typeof obj !== "object") return
	if (!Array.isArray(pathParts) || pathParts.length === 0) return
	let cur = obj
	for (let i = 0; i < pathParts.length; i++) {
		const key = String(pathParts[i] || "")
		if (!key) return
		const isLast = i === pathParts.length - 1
		if (isLast) {
			cur[key] = value
			return
		}
		if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) cur[key] = {}
		cur = cur[key]
	}
}

function formatDateForComment(d = new Date()) {
	// YYYY-MM-DD
	return d.toISOString().slice(0, 10)
}

async function fetchJson(url, init, { timeoutMs } = {}) {
	const controller = new AbortController()
	const timeout = typeof timeoutMs === "number" ? timeoutMs : getEnvInt("HTTP_TIMEOUT_MS", 15000, { min: 1000 })
	const t = setTimeout(() => controller.abort(), timeout)
	try {
		const res = await fetch(url, { ...init, signal: controller.signal })
		const text = await res.text().catch(() => "")
		if (!res.ok) {
			const err = new Error(`HTTP ${res.status} ${res.statusText}`)
			err.status = res.status
			err.url = url
			err.bodyText = truncate(text || "", 5000)
			throw err
		}
		return text ? JSON.parse(text) : {}
	} finally {
		clearTimeout(t)
	}
}

module.exports = {
	json,
	truncate,
	redactHeaders,
	getPath,
	asNonEmptyString,
	toSmartlingLocaleId,
	toContentstackLocaleCode,
	setDeep,
	formatDateForComment,
	fetchJson,
}

