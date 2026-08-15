# Real iPhone/Safari smoke

Playwright's `mobile-webkit` project is an emulator profile, not physical iOS Safari.
Before a release, run the deployed build on a real iPhone (or an iOS device farm) and record:

- portrait widths at 320, 360 and the device's native viewport;
- checkout field visibility with the on-screen keyboard open;
- landscape checkout and rotation back to portrait;
- sticky header and cart drawer after a long scroll;
- product gallery tap, pinch/zoom and lightbox close;
- long Latvian and Russian labels without horizontal overflow;
- admin tables and crop preview/apply if the device is authorized for admin access.

The automated counterpart is `e2e/cross-browser-responsive.spec.ts --project=mobile-webkit`.
Physical-device evidence should include the iOS version, device model, deployed URL and screenshots/video for failures.
