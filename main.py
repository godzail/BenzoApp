import asyncio
import os
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Gas Station Finder API")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up logging
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Serve static files
app.mount("/static", StaticFiles(directory="."), name="static")


# Pydantic models for request/response
class SearchRequest(BaseModel):
    city: str
    radius: int
    fuel: str


class FuelPrice(BaseModel):
    type: str
    price: float


class Station(BaseModel):
    id: str
    address: str
    latitude: float
    longitude: float
    fuel_prices: List[FuelPrice]


class SearchResponse(BaseModel):
    stations: List[Station]


# Nominatim geocoding function
async def geocode_city(city: str):
    """Geocode a city name to latitude and longitude using OpenStreetMap Nominatim"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": city, "format": "json", "limit": 1},
                headers={"User-Agent": "GasStationFinder/1.0"},
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                raise HTTPException(status_code=404, detail="City not found")

            location = data[0]
            return {
                "latitude": float(location["lat"]),
                "longitude": float(location["lon"]),
            }
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Geocoding service unavailable: {str(e)}")


# Prezzi Carburante API integration
async def fetch_gas_stations(latitude: float, longitude: float, distance: int, fuel: str):
    """Fetch gas stations from Prezzi Carburante API"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://prezzi-carburante.onrender.com/api/distributori",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "distance": distance,
                    "fuel": fuel,
                },
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"API response data: {data}")
            logger.info(f"API response data type: {type(data)}")
            return data
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Gas station API unavailable: {str(e)}")


# Search endpoint
@app.post("/search")
async def search_gas_stations(request: SearchRequest, req: Request):
    """Search for gas stations near a city within a given radius"""
    logger.info("=== ENTERING search_gas_stations ===")
    logger.info(f"Received search request: city={request.city}, radius={request.radius}, fuel={request.fuel}")
    # Log the raw request body for debugging
    body = await req.body()
    logger.info(f"Raw request body: {body}")
    logger.info(f"Request headers: {req.headers}")
    logger.info(f"Request type: {type(request)}")
    logger.info(f"City type: {type(request.city)}")
    logger.info(f"Radius type: {type(request.radius)}")
    logger.info(f"Fuel type: {type(request.fuel)}")
    try:
        # Geocode the city to get coordinates
        location = await geocode_city(request.city)

        # Fetch gas stations from Prezzi Carburante API
        stations_data = await fetch_gas_stations(
            location["latitude"], location["longitude"], request.radius, request.fuel
        )
        logger.info(f"Received stations data: {stations_data}")
        logger.info(f"Stations data type: {type(stations_data)}")

        # Process and sort stations by fuel price
        logger.info(f"Processing stations data: {stations_data}")
        stations = []
        for station_id, station_data in stations_data.items():
            logger.info(f"Processing station {station_id}: {station_data}")
            # Extract fuel prices and sort them
            fuel_prices = []
            # The API returns a single price per station, not a list of fuels
            try:
                fuel_price = float(station_data.get("prezzo", 0.0))
                logger.info(f"Fuel price for station {station_id}: {fuel_price}")
                fuel_prices.append(
                    FuelPrice(
                        type=request.fuel,  # Use the requested fuel type
                        price=fuel_price,
                    )
                )
            except ValueError as e:
                logger.error(f"Error converting fuel price for station {station_id}: {e}")
                fuel_prices.append(
                    FuelPrice(
                        type=request.fuel,
                        price=0.0,
                    )
                )

            # Sort fuel prices by price (ascending) - only one price, so no need to sort

            try:
                latitude = float(station_data.get("latitudine", 0.0))
                longitude = float(station_data.get("longitudine", 0.0))
                logger.info(f"Station {station_id} coordinates: lat={latitude}, lon={longitude}")
            except ValueError as e:
                logger.error(f"Error converting coordinates for station {station_id}: {e}")
                latitude = 0.0
                longitude = 0.0

            station = Station(
                id=station_id,  # Use the dictionary key as the station ID
                address=station_data.get("indirizzo", ""),
                latitude=latitude,
                longitude=longitude,
                fuel_prices=fuel_prices,
            )
            stations.append(station)

        # Log the response data for debugging
        response_data = SearchResponse(stations=stations)
        logger.info(f"Response data: {response_data}")
        logger.info(f"Response data dict: {response_data.dict()}")

        # Log the response data for debugging
        logger.info(f"Response data: {response_data}")
        logger.info(f"Response data dict: {response_data.dict()}")

        # Return JSON response
        logger.info("=== EXITING search_gas_stations ===")
        return response_data

    except HTTPException as e:
        logger.error(f"HTTPException in search_gas_stations: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"Exception in search_gas_stations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


# Serve the main page
@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("index.html", "r") as file:
        return file.read()


# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
