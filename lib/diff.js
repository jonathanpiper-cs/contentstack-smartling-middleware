const DIFF_IGNORED_KEYS = new Set([
	"tags",
	"locale",
	"uid",
	"created_by",
	"created_at",
	"create_at",
	"updated_by",
	"updated_at",
	"ACL",
	"_version",
	"_workflow",
	"_in_progress",
	"publish_details",
	"_rules",
])

function stripTopLevelSystemFields(entry) {
	if (!entry || typeof entry !== "object") return entry
	const out = {}
	for (const [k, v] of Object.entries(entry)) {
		if (DIFF_IGNORED_KEYS.has(k)) continue
		if (k.startsWith("_") && k !== "_metadata") continue
		out[k] = v
	}
	return out
}

function diffLeafValues(a, b, path = []) {
	const changes = []

	const isObj = (v) => v && typeof v === "object" && !Array.isArray(v)
	const isLeaf = (v) => v === null || ["string", "number", "boolean"].includes(typeof v) || Array.isArray(v)
	const isEmptyDraftValue = (v) => {
		if (v === null || v === undefined) return true
		if (typeof v === "string") return v.trim().length === 0
		if (Array.isArray(v)) return v.length === 0
		return false
	}

	// Treat arrays as leafs (diff as JSON)
	if (isLeaf(a) || isLeaf(b)) {
		// Ignore fields that ONLY exist in draft AND are empty/null in draft
		// (i.e. published is missing/undefined).
		if (a === undefined && isEmptyDraftValue(b)) return changes

		const sa = a === undefined ? undefined : JSON.stringify(a)
		const sb = b === undefined ? undefined : JSON.stringify(b)
		if (sa !== sb) {
			changes.push({ path: path.join("."), after: b })
		}
		return changes
	}

	// Descend objects
	if (!isObj(a) && !isObj(b)) {
		if (a === undefined && isEmptyDraftValue(b)) return changes
		if (a !== b) changes.push({ path: path.join("."), after: b })
		return changes
	}

	const keys = new Set([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])])
	for (const k of keys) {
		if (k === undefined || k === null) continue
		if (DIFF_IGNORED_KEYS.has(k)) continue
		changes.push(...diffLeafValues(a?.[k], b?.[k], [...path, k]))
	}
	return changes
}

module.exports = {
	DIFF_IGNORED_KEYS,
	stripTopLevelSystemFields,
	diffLeafValues,
}

