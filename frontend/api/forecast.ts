// GET /api/forecast: the next 24 hours and the next 7 days for the station's location, from
// Open-Meteo.
import type { ForecastResponse } from '../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../server/http.js';
import { fetchForecast } from '../server/open-meteo.js';
import { rejectUnexpectedParams } from '../server/params.js';
import { stationCoordinates } from '../server/station-choice.js';
import { requestStation } from '../server/supabase.js';

// Open-Meteo runs its models every hour or so; 15 minutes also keeps the hourly strip starting
// at the current hour, and our calls far below its free limits.
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
      // The forecast tab says the station has none.
      return notFound('no coordinates for this station');
    }
    return json<ForecastResponse>(await fetchForecast(coordinates), CACHE);
  } catch (error) {
    return serverError(error);
  }
}
