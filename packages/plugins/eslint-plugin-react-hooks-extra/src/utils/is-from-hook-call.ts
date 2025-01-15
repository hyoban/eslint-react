import { isReactHookCallWithNameAlias } from "@eslint-react/core";
import { returnTrue } from "@eslint-react/eff";
import type { ESLintReactSettingsNormalized, REACT_BUILD_IN_HOOKS, RuleContext } from "@eslint-react/shared";
import * as VAR from "@eslint-react/var";
import type { TSESTree } from "@typescript-eslint/types";
import { AST_NODE_TYPES as T } from "@typescript-eslint/types";

export function isFromHookCall(
  name: (typeof REACT_BUILD_IN_HOOKS)[number],
  context: RuleContext,
  settings: ESLintReactSettingsNormalized,
  predicate: (topLevelId: TSESTree.Identifier, call: TSESTree.CallExpression) => boolean = returnTrue,
) {
  const hookAlias = settings.additionalHooks[name] ?? [];
  return (topLevelId: TSESTree.Identifier) => {
    const variable = VAR.findVariable(topLevelId, context.sourceCode.getScope(topLevelId));
    const variableNode = VAR.getVariableNode(variable, 0);
    if (variableNode == null) return false;
    if (variableNode.type !== T.CallExpression) return false;
    if (!isReactHookCallWithNameAlias(name, context, hookAlias)(variableNode)) return false;
    return predicate(topLevelId, variableNode);
  };
}
