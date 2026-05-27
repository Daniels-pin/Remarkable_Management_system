import type * as React from "react";

export function preventFurnitureFormNativeSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

export function preventFurnitureFormEnterSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") {
    return;
  }
  if (event.target instanceof HTMLTextAreaElement) {
    return;
  }
  event.preventDefault();
}
