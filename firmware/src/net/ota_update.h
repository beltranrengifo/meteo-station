#pragma once

// OTA updates. A delivered upload's response may offer another firmware (signed URL, sha256,
// size; see backend/supabase/functions/ingest/update.ts). The board downloads it into the
// other app slot, checks its sha256 and reboots into it. The new firmware must deliver one
// upload within OTA_VERIFY_TIMEOUT_MS (lib/ota_policy), or the board goes back to the previous
// one, which then never installs that version again.

// In setup(), before anything else can reboot the board: handles the first boot after an update.
void otaBegin();

// Call from loop(): installs an accepted offer, and rolls back a new firmware that delivered
// nothing in time.
void otaLoop();

// Call with the response body of every delivered upload.
void otaOnDelivered(const char *responseBody);
