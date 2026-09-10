# Seattle street source

`source-streets.json` is the reproducible source extract retrieved on 2026-09-10.
Attribution: **City of Seattle, Seattle Department of Transportation**.

- [Seattle Streets feature service](https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Seattle_Streets_1/FeatureServer/0)
- [Seattle data terms](https://data.seattle.gov/stories/s/Terms-of-Use/6ukr-wvup/)
- [Seattle Open Data Policy, section E](https://www.seattle.gov/documents/departments/seattlegovportals/cityservices/opendatapolicyv1.pdf)

The city's open-data policy permits reuse and modification, including commercial use. The city disclaims accuracy and provides the data as-is. This game is an adaptation, not a city-endorsed map or navigation product. No Google Maps imagery or geometry is included.

The extract includes street centerlines in longitude/latitude bounds
`[-122.347,47.578,-122.320,47.615]`, selected attributes and the retrieval URL.
It is an offline build source, not a live runtime dependency.

From the repository root:

```powershell
node scripts/fetch-seattle.mjs
python -m pip install --target artifacts/map-tools shapely==2.1.2
python scripts/build-seattle.py
```

Fetching refreshes the source snapshot; omit that first command to reproduce from the checked-in extract. The builder needs Python and Shapely only during regeneration. Normal `pnpm dev` and `pnpm build` use the checked-in `src/sim/seattle-data.json` and do not need Python or external GIS access.

The generator selects a connected subset, rounds coordinates, compresses east/west distances to 58% and north/south to 50%, widens streets, and adds fictional Harbor Way and three access connections. All crossings in this slice are treated as at-grade. Street names/source IDs on merged edges identify a representative source segment; they are not cadastral provenance for every vertex. Buildings, grades, pavement, port props, and racing checkpoints are authored game content.
