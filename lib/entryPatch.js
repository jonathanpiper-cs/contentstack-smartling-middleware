const { setDeep } = require("./utils")

function diffToSmartlingItems(changedFields) {
	const items = []
	for (const obj of Array.isArray(changedFields) ? changedFields : []) {
		if (!obj || typeof obj !== "object") continue
		for (const [path, value] of Object.entries(obj)) {
			if (typeof value !== "string") continue
			const sourceText = value.trim()
			if (!sourceText) continue
			items.push({ key: path, sourceText })
			if (items.length >= 1000) return items
		}
	}
	return items
}

function buildEntryPatchFromChangedFields({ changedFields, translations }) {
	const out = {}
	for (const obj of Array.isArray(changedFields) ? changedFields : []) {
		if (!obj || typeof obj !== "object") continue
		for (const [path, draftValue] of Object.entries(obj)) {
			if (!path) continue
			let value = draftValue
			if (typeof draftValue === "string" && translations && typeof translations[path] === "string") {
				value = translations[path]
			}
			if (value === undefined) continue
			setDeep(out, path.split("."), value)
		}
	}
	return out
}

module.exports = {
	diffToSmartlingItems,
	buildEntryPatchFromChangedFields,
}

