#pragma once

// Copy to secrets.h (git-ignored) and fill in. WiFi, device id and device key are not here:
// each station keeps its own in NVS, set from a phone with the setup portal.
#define INGEST_URL "https://<your-supabase>/functions/v1/ingest"
