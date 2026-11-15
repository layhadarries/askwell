/** Lives inside the closed shadow root only. Nothing reaches the host page. */
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; z-index: 2147483000; display: flex; flex-direction: column; gap: 12px;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap.bottom-right { right: 20px; bottom: 20px; align-items: flex-end; }
.wrap.bottom-left { left: 20px; bottom: 20px; align-items: flex-start; }
.wrap.top-right { right: 20px; top: 20px; align-items: flex-end; flex-direction: column-reverse; }
.wrap.top-left { left: 20px; top: 20px; align-items: flex-start; flex-direction: column-reverse; }
.button { position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 48px;
  padding: 0 20px; border: 0; border-radius: 999px; color: #fff; font: inherit; font-weight: 600;
  cursor: pointer; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); }
.button:focus-visible { outline: 2px solid #09090b; outline-offset: 3px; }
.badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 999px; background: #09090b; color: #fff; font-size: 12px; line-height: 20px;
  text-align: center; }
.badge[hidden] { display: none; }
.panel { position: relative; width: 380px; height: 560px; max-height: calc(100vh - 100px);
  border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 16px 48px rgb(0 0 0 / 0.22);
  transition: opacity 200ms ease, transform 200ms ease; }
.panel[hidden] { display: none; }
.panel iframe { display: block; width: 100%; height: 100%; border: 0; }
.close { position: absolute; top: 6px; right: 6px; width: 32px; height: 32px; border: 0;
  border-radius: 8px; background: transparent; color: #52525b; font: 20px/1 system-ui, sans-serif;
  cursor: pointer; opacity: 0; }
.close:focus-visible { opacity: 1; outline: 2px solid #09090b; }
.panel.fade.enter { opacity: 0; }
.panel.slide.enter { opacity: 0; transform: translateY(16px); }
.panel.scale.enter { opacity: 0; transform: scale(0.92); }
.wrap.bottom-right .panel { transform-origin: bottom right; }
.wrap.bottom-left .panel { transform-origin: bottom left; }
.wrap.top-right .panel { transform-origin: top right; }
.wrap.top-left .panel { transform-origin: top left; }
@media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
@media (max-width: 479.98px) {
  .panel { position: fixed; inset: 0; width: 100vw; height: 100vh !important; height: 100dvh !important;
    max-height: none; border-radius: 0; }
  .close { opacity: 1; }
}
`;
