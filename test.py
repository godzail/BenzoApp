import asyncio

import httpx

from main import fetch_gas_stations, geocode_city


async def test_geocoding():
    """Test the geocoding functionality"""
    print("Testing geocoding...")
    try:
        location = await geocode_city("Rome")
        print(f"Geocoding successful: {location}")
        return location
    except Exception as e:
        print(f"Geocoding failed: {e}")
        return None


async def test_api_integration():
    """Test the Prezzi Carburante API integration"""
    print("Testing API integration...")
    try:
        # Test with Rome coordinates
        stations = await fetch_gas_stations(41.9028, 12.4964, 5, "benzina")
        print(f"API integration successful: Found {len(stations)} stations")
        return stations
    except Exception as e:
        print(f"API integration failed: {e}")
        return None


async def test_full_workflow():
    """Test the full workflow"""
    print("Testing full workflow...")
    try:
        # Step 1: Geocode a city
        location = await geocode_city("Rome")
        print(f"Geocoded Rome to: {location}")

        # Step 2: Fetch gas stations
        stations = await fetch_gas_stations(
            location["latitude"],
            location["longitude"],
            5,  # 5 km radius
            "benzina",  # fuel type
        )
        print(f"Found {len(stations)} gas stations")

        # Step 3: Display first station info
        if stations:
            first_station = stations[0]
            print(f"First station: {first_station.get('address', 'No address')}")
            if "fuels" in first_station:
                print("Fuel prices:")
                for fuel in first_station["fuels"]:
                    print(
                        f"  {fuel.get('type', 'Unknown')}: €{fuel.get('price', 0.0):.3f}"
                    )

        return True
    except Exception as e:
        print(f"Full workflow test failed: {e}")
        return False


async def main():
    """Run all tests"""
    print("Starting tests...\n")

    # Test geocoding
    await test_geocoding()
    print()

    # Test API integration
    await test_api_integration()
    print()

    # Test full workflow
    success = await test_full_workflow()
    print()

    if success:
        print("All tests passed! The application is ready to use.")
    else:
        print("Some tests failed. Please check the implementation.")


if __name__ == "__main__":
    asyncio.run(main())
