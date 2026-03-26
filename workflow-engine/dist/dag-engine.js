function getNormalTriggerSteps(steps) {
    return steps.filter((step) => step.triggerOn !== "escalation");
}
export function validateDag(steps) {
    const errors = [];
    const duplicateIds = new Set();
    const stepById = new Map();
    for (const step of steps) {
        if (stepById.has(step.id)) {
            duplicateIds.add(step.id);
            continue;
        }
        stepById.set(step.id, step);
    }
    for (const duplicateId of duplicateIds) {
        errors.push(`Duplicate step ID found: "${duplicateId}".`);
    }
    for (const step of steps) {
        if (duplicateIds.has(step.id)) {
            continue;
        }
        for (const dependencyId of step.dependsOn) {
            if (!stepById.has(dependencyId)) {
                errors.push(`Step "${step.id}" depends on missing step "${dependencyId}".`);
            }
        }
        if (step.escalateTo !== undefined && !stepById.has(step.escalateTo)) {
            errors.push(`Step "${step.id}" escalates to missing step "${step.escalateTo}".`);
        }
    }
    const uniqueSteps = steps.filter((step) => !duplicateIds.has(step.id));
    const indegree = new Map();
    const adjacency = new Map();
    for (const step of uniqueSteps) {
        indegree.set(step.id, 0);
        adjacency.set(step.id, []);
    }
    for (const step of uniqueSteps) {
        for (const dependencyId of step.dependsOn) {
            if (!stepById.has(dependencyId) || duplicateIds.has(dependencyId)) {
                continue;
            }
            adjacency.get(dependencyId)?.push(step.id);
            indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
        }
    }
    const queue = [];
    for (const step of uniqueSteps) {
        if ((indegree.get(step.id) ?? 0) === 0) {
            queue.push(step.id);
        }
    }
    const topologicalOrder = [];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
        const currentId = queue[queueIndex];
        queueIndex += 1;
        topologicalOrder.push(currentId);
        const neighbors = adjacency.get(currentId) ?? [];
        for (const neighborId of neighbors) {
            const nextIndegree = (indegree.get(neighborId) ?? 0) - 1;
            indegree.set(neighborId, nextIndegree);
            if (nextIndegree === 0) {
                queue.push(neighborId);
            }
        }
    }
    if (topologicalOrder.length < uniqueSteps.length) {
        errors.push("Cycle detected in workflow steps.");
    }
    if (errors.length > 0) {
        return {
            valid: false,
            errors,
            topologicalOrder: [],
        };
    }
    return {
        valid: true,
        errors: [],
        topologicalOrder,
    };
}
export function getNextSteps(steps, completedStepIds, failedStepIds, skippedStepIds) {
    const readyStepIds = steps
        .filter((step) => step.triggerOn !== "escalation")
        .filter((step) => !completedStepIds.has(step.id))
        .filter((step) => !failedStepIds.has(step.id))
        .filter((step) => !skippedStepIds.has(step.id))
        .filter((step) => step.dependsOn.every((dependencyId) => completedStepIds.has(dependencyId) || skippedStepIds.has(dependencyId)))
        .map((step) => step.id);
    const isWorkflowComplete = getNormalTriggerSteps(steps).every((step) => completedStepIds.has(step.id) ||
        skippedStepIds.has(step.id) ||
        failedStepIds.has(step.id));
    return {
        readyStepIds,
        isWorkflowComplete,
    };
}
export function getEscalationTarget(steps, failedStepId) {
    const failedStep = steps.find((step) => step.id === failedStepId);
    if (failedStep?.onFailure !== "escalate") {
        return null;
    }
    return failedStep.escalateTo ?? null;
}
export function getRetryInfo(steps, stepId) {
    const step = steps.find((candidate) => candidate.id === stepId);
    if (step?.onFailure !== "retry") {
        return {
            shouldRetry: false,
            maxRetries: 0,
        };
    }
    return {
        shouldRetry: true,
        maxRetries: step.maxRetries ?? 2,
    };
}
