// Background script (MV3 event page). Listeners are registered at top level.

import { createController } from "./lib/controller.js";

const controller = createController({
  messenger,
  fetchImpl: (...args) => fetch(...args),
});

messenger.runtime.onMessage.addListener((message, sender) =>
  controller.handleMessage(message, sender));

messenger.messageDisplay.onMessagesDisplayed.addListener((tab, displayed) =>
  controller.updateButton(tab, displayed));
