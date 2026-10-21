# Design sources

- `og-image.svg`: the link preview image (WhatsApp, Telegram, X...), 1200 x 630. After editing it, render it again from `frontend/`:

  ```sh
  deno run -A --no-lock --node-modules-dir=none design/render.ts design/og-image.svg public/og-image.png 1200
  ```

  Link previews are cached by each app, so a new image can take days to show in old chats.

- `app-icon.svg`: the installable app icon (PWA home screen, Android and iPhone). It renders to three PNG files: 192 × 192 (Android), 512 × 512 (PWA splash screen and maskable icon), and 180 × 180 (iPhone home screen). From `frontend/`:

  ```sh
  deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/icon-512.png 512
  deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/icon-192.png 192
  deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/apple-touch-icon.png 180
  ```

  If the logo in `public/favicon.svg` changes, update both `favicon.svg` and `app-icon.svg` with the new drawing.
