const fs = require("node:fs")

/**
 * Tiny `.env` loader (no dependency).
 * - Ignores blank lines and `#` comments
 * - Supports KEY=VALUE (VALUE may be single/double-quoted)
 * - Does not overwrite already-set process.env values
 */
function loadDotEnv(filePath = ".env") {
	try {
		const raw = fs.readFileSync(filePath, "utf8")
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			const eq = trimmed.indexOf("=")
			if (eq <= 0) continue
			const key = trimmed.slice(0, eq).trim()
			let value = trimmed.slice(eq + 1).trim()
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1)
			}
			if (!(key in process.env)) process.env[key] = value
		}
	} catch {
		// .env is optional
	}
}

function getEnv(name, defaultValue = undefined) {
	const v = process.env[name]
	if (v === undefined || v === null) return defaultValue
	const s = String(v).trim()
	return s ? s : defaultValue
}

function requireEnv(name) {
	const v = getEnv(name, undefined)
	if (!v) throw new Error(`Missing required env var: ${name}`)
	return v
}

function getEnvInt(name, defaultValue, { min, max } = {}) {
	const raw = getEnv(name, undefined)
	if (raw === undefined) return defaultValue
	const n = Number.parseInt(raw, 10)
	if (!Number.isFinite(n)) return defaultValue
	if (typeof min === "number" && n < min) return defaultValue
	if (typeof max === "number" && n > max) return defaultValue
	return n
}

function getEnvCsv(name, { toLowerCase = false } = {}) {
	const raw = getEnv(name, "")
	if (!raw) return []
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (toLowerCase ? s.toLowerCase() : s))
}

module.exports = {
	loadDotEnv,
	getEnv,
	requireEnv,
	getEnvInt,
	getEnvCsv,
}

