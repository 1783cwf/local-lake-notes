import { installDomMutationGuard } from "./domMutationGuard";

test("removeChild 遇到已经被移走的节点时保持幂等", () => {
  installDomMutationGuard();
  const parent = document.createElement("div");
  const otherParent = document.createElement("section");
  const child = document.createElement("span");
  otherParent.appendChild(child);

  expect(() => parent.removeChild(child)).not.toThrow();
  expect(child.parentNode).toBe(otherParent);
});

test("removeChild 对真实子节点仍按原生逻辑移除", () => {
  installDomMutationGuard();
  const parent = document.createElement("div");
  const child = document.createElement("span");
  parent.appendChild(child);

  expect(parent.removeChild(child)).toBe(child);
  expect(parent.contains(child)).toBe(false);
});
