const removeChildGuardMarker = "__localLakeNotesRemoveChildGuarded";

type GuardedRemoveChild = typeof Node.prototype.removeChild & {
  [removeChildGuardMarker]?: boolean;
};

export function installDomMutationGuard(): void {
  if (typeof Node === "undefined") {
    return;
  }

  const currentRemoveChild = Node.prototype.removeChild as GuardedRemoveChild;
  if (currentRemoveChild[removeChildGuardMarker]) {
    return;
  }

  const originalRemoveChild = Node.prototype.removeChild;
  const guardedRemoveChild = function <T extends Node>(this: Node, child: T): T {
    // Lake/Univer 等第三方编辑器会直接操作自己的 DOM；切换页签时 React 可能重复移除已被拿走的节点。
    // 这种场景下 removeChild 本身已经达成目标，保持幂等可以避免整棵 React root 白屏。
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as GuardedRemoveChild;

  Object.defineProperty(guardedRemoveChild, removeChildGuardMarker, {
    value: true,
  });
  Node.prototype.removeChild = guardedRemoveChild;
}
