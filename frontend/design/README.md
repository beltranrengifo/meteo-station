# Design sources

- `og-image.svg`: the link preview image (WhatsApp, Telegram, X...), 1200 x 630. After editing it, render it again from `frontend/`:

  ```sh
  deno run -A --no-lock --node-modules-dir=none design/render.ts design/og-image.svg public/og-image.png 1200
  ```

  Link previews are cached by each app, so a new image can take days to show in old chats.
