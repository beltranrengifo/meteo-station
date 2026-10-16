// GET /api/sky: sky state and UV for the station's location, from Open-Meteo.
import type { SkyResponse } from '../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../server/http.js';
import { fetchSky } from '../server/open-meteo.js';
import { rejectUnexpectedParams } from '../server/params.js';
import { stationCoordinates } from '../server/station-choice.js';
import { requestStation } from '../server/supabase.js';

// Open-Meteo updates current values every 15 minutes. The CDN cache also keeps our
// calls far below its free limits, however many people open the dashboard.
const CACHE = { sMaxAge: 900, staleWhileRevalidate: 900 };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const invalid = rejectUnexpectedParams(url, []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const station = await requestStation(url);
    if (!station.ok) {
      return notFound(station.error);
    }
    const coordinates = stationCoordinates(process.env.STATION_COORDINATES, station.value.deviceId);
    if (!coordinates) {
      // The dashboard shows the station without its sky.
      return notFound('no coordinates for this station');
    }
    return json<SkyResponse>(await fetchSky(coordinates), CACHE);
  } catch (error) {
    return serverError(error);
  }
}
