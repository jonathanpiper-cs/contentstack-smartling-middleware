const { requireEnv } = require("./env")
const { fetchJson } = require("./utils")

let tokenCache = null // { accessToken, expiresAtMs }

async function authenticate() {
	const now = Date.now()
	if (tokenCache?.accessToken && tokenCache.expiresAtMs - now > 30_000) return tokenCache.accessToken

	const userIdentifier = requireEnv("SMARTLING_USER_IDENTIFIER")
	const userSecret = requireEnv("SMARTLING_USER_SECRET")

	const resp = await fetchJson("https://api.smartling.com/auth-api/v2/authenticate", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({ userIdentifier, userSecret }),
	})

	const data = resp?.response?.data
	const accessToken = data?.accessToken
	const expiresIn = data?.expiresIn
	if (typeof accessToken !== "string" || !accessToken) throw new Error("Smartling auth: missing accessToken")

	tokenCache = { accessToken, expiresAtMs: now + (Number(expiresIn) || 480) * 1000 }
	return accessToken
}

async function mtTranslate({ sourceLocaleId, targetLocaleId, items }) {
	const accountUid = requireEnv("SMARTLING_ACCOUNT_UID")
	const token = await authenticate()

	const resp = await fetchJson(`https://api.smartling.com/mt-router-api/v2/accounts/${encodeURIComponent(accountUid)}/smartling-mt`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({ sourceLocaleId, targetLocaleId, items }),
	})

	const code = resp?.response?.code
	if (code !== "SUCCESS") {
		const err = new Error(`Smartling MT failed (code=${code || "UNKNOWN"})`)
		err.smartlingResponse = resp
		throw err
	}

	return resp?.response?.data
}

module.exports = {
	mtTranslate,
}

