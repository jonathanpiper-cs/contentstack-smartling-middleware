const { asNonEmptyString, getPath } = require("./utils")

function extractContentstackWorkflowIds(payload) {
	const module = asNonEmptyString(payload?.module)
	const event = asNonEmptyString(payload?.event)

	const contentTypeUid = asNonEmptyString(getPath(payload, ["data", "workflow", "content_type", "uid"]))
	const entryUid = asNonEmptyString(getPath(payload, ["data", "workflow", "entry", "uid"]))
	const localeCode = asNonEmptyString(getPath(payload, ["data", "workflow", "locale", "code"]))
	const stageName = asNonEmptyString(getPath(payload, ["data", "workflow", "log", "name"]))
	const stageUid = asNonEmptyString(getPath(payload, ["data", "workflow", "log", "uid"]))

	if (!contentTypeUid || !entryUid) return null

	return {
		module: module || "workflow",
		event: event || "update",
		contentTypeUid,
		entryUid,
		...(localeCode ? { locale: localeCode } : {}),
		...(stageName ? { workflowStageName: stageName } : {}),
		...(stageUid ? { workflowStageUid: stageUid } : {}),
	}
}

module.exports = { extractContentstackWorkflowIds }

