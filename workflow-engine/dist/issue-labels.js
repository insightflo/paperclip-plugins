function normalizeLabelIds(labelIds) {
    return [...new Set((labelIds ?? []).map((labelId) => labelId.trim()).filter(Boolean))];
}
function sameLabelIds(left, right) {
    const normalizedLeft = normalizeLabelIds(left).sort();
    const normalizedRight = normalizeLabelIds(right).sort();
    if (normalizedLeft.length !== normalizedRight.length) {
        return false;
    }
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
export async function ensureIssueLabels(ctx, issueId, companyId, labelIds) {
    const nextLabelIds = normalizeLabelIds(labelIds);
    if (nextLabelIds.length === 0) {
        return;
    }
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue) {
        return;
    }
    const currentLabelIds = Array.isArray(issue.labelIds)
        ? issue.labelIds
        : [];
    if (sameLabelIds(currentLabelIds, nextLabelIds)) {
        return;
    }
    await ctx.issues.update(issueId, { labelIds: nextLabelIds }, companyId);
}
