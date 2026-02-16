/**
 * Split entry for UI helper methods.  This file keeps the public
 * `AppUiMixin` type and ensures `window.appUiMixin` exists.  The
 * heavy implementations were moved into smaller files so each file
 * stays under ~500 lines.
 */
// @ts-nocheck
// Ensure the global mixin object exists so the smaller modules can augment it.
window.appUiMixin = (window.appUiMixin || {});
export {};
//# sourceMappingURL=app.ui.js.map