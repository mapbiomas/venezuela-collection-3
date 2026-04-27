![MapBiomas Venezuela](./mapbiomas-venezuela.png)

[![Back to Venezuela All Initiatives](https://img.shields.io/badge/←%20Venezuela%20All%20Initiatives-gray?style=for-the-badge)](https://github.com/mapbiomas/venezuela-all-initiatives)

# MapBiomas Venezuela

_**Land Use and Land Cover Classification Module**_

MapBiomas Venezuela monitors land use and land cover changes at a national scale through annual multitemporal mapping, enabling the analysis of ecosystem pressures and human expansion across all Venezuelan regions. To produce annual historical land use and land cover maps, the initiative uses Google Earth Engine and collaborates with a network of regional experts. By 2026, Venezuela developed Collection 3, covering the entire national territory across all administrative regions including Amazon, Andes, Central, Guayana Esequiba, Llanos (plains), Western and Eastern regions.

## Repository Structure

```text
venezuela-collection-3/
    ├── 02-2-training-samples.js
    ├── 03-0-classifier.js
    ├── 03-2-gapfill.js
    ├── 03-3-spatial-filter.js
    ├── 03-4-temporal-filter.js
    └── 03-5-frequency-filter.js
```

## General Features

MapBiomas Venezuela Collection 3 maps are generated using machine learning in Google Earth Engine through pixel-by-pixel classification of Landsat imagery at 30 m resolution. The time series covers 1985 to 2024, organized by classification regions across the national territory.

## Methodological Steps

| Script | Description |
|--------|-------------|
| `01-1-training-samples.js` | Generates and prepares training samples for the machine learning classifier |
| `01-2-classifier.js` | Supervised classification using Random Forest algorithm in Google Earth Engine |
| `02-1-gapfill.js` | Fills temporal gaps in the historical image time series |
| `02-2-spatial-filter.js` | Spatial connectivity filter to remove isolated pixels |
| `02-3-temporal-filter.js` | Temporal consistency filter for annual transitions |
| `02-4-frequency-filter.js` | Frequency-based majority filter for noise reduction |

## Results

The processed outputs are integrated into the MapBiomas Venezuela Collection 3 land use and land cover maps, enabling:

- Environmental monitoring and ecosystem accounting.
- Public policy development and territorial planning.
- Scientific research and biodiversity assessment.
- Historical analysis from 1985 to 2024.

If you are not familiar with MapBiomas workflows, check the [official methodology documentation](https://venezuela.mapbiomas.org/descripcion-general-de-la-metodologia/).

For more information about MapBiomas Venezuela, visit [venezuela.mapbiomas.org](https://venezuela.mapbiomas.org).

To explore the products from the available modules, visit [plataforma.venezuela.mapbiomas.org](https://plataforma.venezuela.mapbiomas.org).
