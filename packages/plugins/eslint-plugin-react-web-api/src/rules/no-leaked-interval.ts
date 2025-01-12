import type * as AST from "@eslint-react/ast";
import type { EREffectMethodKind, ERLifecycleMethodKind, ERPhaseKind } from "@eslint-react/core";
import { ERPhaseRelevance } from "@eslint-react/core";
import { _ } from "@eslint-react/eff";
import type { RuleFeature } from "@eslint-react/types";
import * as VAR from "@eslint-react/var";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES as T } from "@typescript-eslint/utils";
import { isMatching, P } from "ts-pattern";

import type { TimerEntry } from "../models";
import { createRule, getPhaseKindOfFunction, isInstanceIDEqual } from "../utils";

// #region Rule Metadata

export const RULE_NAME = "no-leaked-interval";

export const RULE_FEATURES = [
  "CHK",
] as const satisfies RuleFeature[];

export type MessageID =
  | "noLeakedIntervalInEffect"
  | "noLeakedIntervalInLifecycle"
  | "noLeakedIntervalNoIntervalId";

// #endregion

// #region Types

type FunctionKind = ERPhaseKind | "other";
type EventMethodKind = "setInterval" | "clearInterval";
type CallKind = EventMethodKind | EREffectMethodKind | ERLifecycleMethodKind | "other";

// #endregion

// #region Helpers

function getCallKind(node: TSESTree.CallExpression): CallKind {
  switch (true) {
    case node.callee.type === T.Identifier
      && isMatching(P.union("setInterval", "clearInterval"), node.callee.name):
      return node.callee.name;
    case node.callee.type === T.MemberExpression
      && node.callee.property.type === T.Identifier
      && isMatching(P.union("setInterval", "clearInterval"), node.callee.property.name):
      return node.callee.property.name;
    default:
      return "other";
  }
}

// #endregion

// #region Rule Implementation

export default createRule<[], MessageID>({
  meta: {
    type: "problem",
    docs: {
      description:
        "enforce that every 'setInterval' in a component or custom Hook has a corresponding 'clearInterval'.",
      [Symbol.for("rule_features")]: RULE_FEATURES,
    },
    messages: {
      noLeakedIntervalInEffect:
        "A 'setInterval' created in '{{ kind }}' must be cleared with 'clearInterval' in the cleanup function.",
      noLeakedIntervalInLifecycle:
        "A 'setInterval' created in '{{ kind }}' must be cleared with 'clearInterval' in the 'componentWillUnmount' method.",
      noLeakedIntervalNoIntervalId: "A 'setInterval' must be assigned to a variable for proper cleanup.",
    },
    schema: [],
  },
  name: RULE_NAME,
  create(context) {
    if (!context.sourceCode.text.includes("setInterval")) {
      return {};
    }
    const fEntries: { kind: FunctionKind; node: AST.TSESTreeFunction }[] = [];
    const sEntries: TimerEntry[] = [];
    const cEntries: TimerEntry[] = [];
    function isInverseEntry(a: TimerEntry, b: TimerEntry) {
      return isInstanceIDEqual(a.timerId, b.timerId, context);
    }
    return {
      [":function"](node: AST.TSESTreeFunction) {
        const kind = getPhaseKindOfFunction(node) ?? "other";
        fEntries.push({ kind, node });
      },
      [":function:exit"]() {
        fEntries.pop();
      },
      ["CallExpression"](node) {
        switch (getCallKind(node)) {
          case "setInterval": {
            const fEntry = fEntries.findLast((x) => x.kind !== "other");
            if (fEntry === _) {
              break;
            }
            if (!ERPhaseRelevance.has(fEntry.kind)) {
              break;
            }
            const intervalIdNode = VAR.getVariableDeclaratorId(node);
            if (intervalIdNode == null) {
              context.report({
                messageId: "noLeakedIntervalNoIntervalId",
                node,
              });
              break;
            }
            sEntries.push({
              kind: "interval",
              node,
              callee: node.callee,
              phase: fEntry.kind,
              timerId: intervalIdNode,
            });
            break;
          }
          case "clearInterval": {
            const fEntry = fEntries.findLast((x) => x.kind !== "other");
            if (fEntry === _) {
              break;
            }
            if (!ERPhaseRelevance.has(fEntry.kind)) {
              break;
            }
            const [intervalIdNode] = node.arguments;
            if (intervalIdNode == null) {
              break;
            }
            cEntries.push({
              kind: "interval",
              node,
              callee: node.callee,
              phase: fEntry.kind,
              timerId: intervalIdNode,
            });
            break;
          }
        }
      },
      ["Program:exit"]() {
        for (const sEntry of sEntries) {
          if (cEntries.some((cEntry) => isInverseEntry(sEntry, cEntry))) {
            continue;
          }
          switch (sEntry.phase) {
            case "setup":
            case "cleanup":
              context.report({
                messageId: "noLeakedIntervalInEffect",
                node: sEntry.node,
                data: {
                  kind: "useEffect",
                },
              });
              continue;
            case "mount":
            case "unmount":
              context.report({
                messageId: "noLeakedIntervalInLifecycle",
                node: sEntry.node,
                data: {
                  kind: "componentDidMount",
                },
              });
              continue;
          }
        }
      },
    };
  },
  defaultOptions: [],
});

// #endregion
