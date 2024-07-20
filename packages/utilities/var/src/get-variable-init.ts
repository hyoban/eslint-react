import { F, O } from "@eslint-react/tools";
import type { Variable } from "@typescript-eslint/scope-manager";
import type { TSESTree } from "@typescript-eslint/types";

/**
 * Get the init node of the nth definition of a variable
 * @param at The index number of def in defs
 * @returns A function that takes a variable and returns the init node of the nth definition of that variable
 */
export function getVariableInit(at: number) {
  return (variable: Variable): O.Option<TSESTree.Expression | TSESTree.LetOrConstOrVarDeclaration> => {
    return F.pipe(
      O.some(variable),
      O.flatMapNullable(v => v.defs.at(at)),
      O.flatMap(d =>
        "init" in d.node
          ? O.fromNullable(d.node.init)
          : O.none()
      ),
    );
  };
}