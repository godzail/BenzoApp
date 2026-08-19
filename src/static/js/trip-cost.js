/**
 * Total-cost-of-refuel model.
 *
 * Ranks stations by the *real* cost of a refuel (price × liters, plus the cost of
 * the fuel burned driving there and back), not by the raw €/L. This is the "make
 * choosing a station simpler" core: the cheapest price is not the cheapest trip.
 *
 * Pure client-side module, no DOM or network access, so it stays unit-testable.
 */
export const DEFAULT_PREFS = {
    liters: 40,
    consumptionLp100: 6.5,
    fuelBasePrice: 1.85,
    sort: "total",
};
const EARTH_RADIUS_KM = 6371;
/** Distance in km between two coordinates (haversine), for the client-side fallback. */
export function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/** Read the station's primary €/L price, or null when absent. */
export function stationPrice(station) {
    const raw = station.fuel_prices?.[0]?.price;
    const price = Number(raw);
    return Number.isFinite(price) && price > 0 ? price : null;
}
/**
 * One-way distance in km the API reports for a station, or null when unknown.
 * Prefers the server-computed `distance`; falls back to a client haversine when
 * coordinates and a search origin are both available.
 */
export function stationDistanceKm(station) {
    const direct = Number(station.distance ?? station.distanceKm);
    if (Number.isFinite(direct) && direct >= 0)
        return direct;
    const lat = Number(station.latitude);
    const lon = Number(station.longitude);
    const originLat = Number(station.originLat);
    const originLon = Number(station.originLon);
    if (Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Number.isFinite(originLat) &&
        Number.isFinite(originLon)) {
        return haversineKm(originLon, originLat, lon, lat);
    }
    return null;
}
/**
 * Round-trip fuel burned (in liters) for a detour of `distanceKm` (one-way) at the
 * given consumption rate.
 */
export function detourLiters(distanceKm, consumptionLp100) {
    return (Math.max(0, distanceKm) * 2 * consumptionLp100) / 100;
}
/**
 * Total cost of refueling at this station: the fuel itself plus the cost of the
 * fuel burned driving there and back.
 */
export function totalCost(station, prefs) {
    const price = stationPrice(station);
    if (price == null)
        return Number.POSITIVE_INFINITY;
    const distance = stationDistanceKm(station);
    const detour = detourLiters(distance ?? 0, prefs.consumptionLp100);
    return price * prefs.liters + detour * prefs.fuelBasePrice;
}
/**
 * Spread (in €) between the best and worst total cost across stations — the
 * maximum a careful choice can save on one refuel.
 */
export function savingsRange(stations, prefs) {
    const costs = stations.map((s) => totalCost(s, prefs)).filter((c) => Number.isFinite(c));
    if (costs.length === 0)
        return 0;
    return Math.max(...costs) - Math.min(...costs);
}
//# sourceMappingURL=trip-cost.js.map