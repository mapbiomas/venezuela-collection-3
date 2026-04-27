/**
 * @fileoverview Spatial filter for MapBiomas Venezuela Collection 3.
 * Removes isolated pixels by applying focal mode to connected components
 * below a minimum pixel threshold.
 * 
 * @author MapBiomas Venezuela Team
 * @version 1.0.0
 * @see {@link https://venezuela.mapbiomas.org|MapBiomas Venezuela}
 */

/**
 * Configuration parameters for spatial filtering.
 * @typedef {Object} ParamConfig
 * @property {string} user - Google Earth Engine user name
 * @property {number} regionId - Region identifier for classification
 * @property {number[]} years - Years to process for filtering
 * @property {number[]} yearsPreview - Years to display on map
 * @property {number[]} ignoreClasses - Classes to exclude from filtering
 * @property {Object} remap - Remapping configuration for layers and geometries
 * @property {number} inputVersion - Input classification version
 * @property {number} outputVersion - Output classification version
 * @property {number} mosaicVersion - Mosaic version to use
 */

/**
 * Configuration object for spatial filtering.
 * @type {ParamConfig}
 */
var param = {
  
    user: 'emanuel-valero',

    regionId: 92530,
  
    // Years (processing and visualization)
    years: ee.List.sequence(1985, 2024).getInfo(),
    
    yearsPreview: [
        2010, 2015, 2022
    ],
  
    ignoreClasses: [
        //33
    ],
  
    remap: {
        layers: {
            from: [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 50],
            to:   [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 21, 21, 19, 20, 21, 22, 23, 24, 25, 26, 29, 24, 31, 32, 33, 34, 35, 50],
        },
        geometries: [
            {
                polygons: [ remap_to_11 ],
                years: [2010, 2015, 2020]
            },
            {
                polygons: [ remap_to_33 ],
                years: [2015, 2020]
            }
        ]
    },
  
    inputVersion:  2,
  
    outputVersion: 3,
    
    mosaicVersion: 5,
    
};




/**
 * SpatialFilter constructor - Applies spatial connectivity filter to remove isolated pixels.
 * 
 * @param {ParamConfig} param - Configuration parameters for spatial filtering
 * @constructor
 */
var SpatialFilter = function(param) {
  
    var _this = this;
  
    this.init = function(param) {
      
        var config = {
            user             : param.user,
            scaleNumber      : 30,
            mapType          : 'SATELLITE',
            regionsField     : 'id_regionc',
            regionId         : param.regionId,
            remap            : param.remap,
            years            : param.years,
            ignoreClasses    : param.ignoreClasses,
            inputVersion     : param.inputVersion,
            yearsPreview     : param.yearsPreview,
            mosaicVersion    : param.mosaicVersion,
            outputVersion    : param.outputVersion,
            mosaicRegions    : [ 912, 905, 912, 913 ],
            mosaicVariables  : param.variables || [],
            polygonsToRemap  : param.remap.polygons,
            eightConnected   : param.eightConnected || true,
            minConnectedPx   : param.minConnectedPixels || 5,
            amazonMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            functions        : require('users/Mosaico_Clasification/global-modules:mapbiomas/api').functions,
            inputPath        : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft',
            outputPath       : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft',
            regions          : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette          : require("users/mapbiomas/modules:Palettes.js").get('classification8'),
            eePalette        : require('users/gena/packages:palettes')
        };
  
  
        // functions
        var getRegion = config.functions.getRegion;
        var remapWithPolygons = config.functions.remapWithPolygons;
        
        // Get region vector and raster based on region id
        var region = getRegion(config.regions, config.regionsField, config.regionId);
        var vector = region.vector;
        var regionsRaster = region.rasterMask;
  
      
        // Get mosaics
        var amazonMosaics = _this.getMosaics({
            path: config.amazonMosaics,
            country: config.country,
            variables: config.mosaicVariables,
        });
        
        var caribeMosaics = _this.getMosaics({
            path: config.caribeMosaics,
            country: config.country,
            variables: config.mosaicVariables,
        });
        
        var mosaics = amazonMosaics.merge(caribeMosaics);
      
      
        // Get classification and apply spatial filter
        var input = _this.getImage(config);
        var inputImage = _this.connectPixels(input, config);
        var filtered = _this.applySpatialFilter(inputImage, config);
  
        // Remap by classes
        filtered = _this.remapByClass(filtered, config.remap);
      
        // Remap with polygons
        config.remap.geometries
            .forEach(function(object) {
                object.years
                    .forEach(function(year) {
                        var band = 'classification_' + year;
                        var img = filtered.select(band);
                        var fix = remapWithPolygons(img, object.polygons).rename(band);
                        filtered = filtered.addBands(fix, null, true);
                    });
            });
      
        // Exclude classes
        if(config.ignoreClasses.length > 0) {
            var classification = ee.List([]);
            var bandNames = filtered.bandNames();
            input = input.select(bandNames);
             
            config.ignoreClasses.forEach(function(classId){
                var coverClass = input.eq(classId).selfMask();
                classification = classification
                    .add(input.updateMask(coverClass).selfMask());
            });
                
            classification = ee.ImageCollection(classification).max();
            filtered = filtered.blend(classification);
            
            Map.addLayer(classification,{},'EXCLUDED CLASS');
            print('Excluded classes',config.ignoreClasses);
        }
  
        // Display to map
        config.yearsPreview
            .map(
                function(year){
                    _this.addMosaic(mosaics, year, regionsRaster);
                    _this.addClassification(inputImage, year, config.palette, 'CLASSIFICATION');
                    _this.addClassification(filtered, year, config.palette, 'FILTERED');
                });
      
        // Export asset
        var filename = config.regionId + '-' + config.outputVersion;
        var imageId = config.outputPath + '/' + filename;
        
        Export.image.toAsset({
            image: filtered.byte(),
            description: filename,
            assetId: imageId,
            scale: config.scaleNumber,
            pyramidingPolicy: { '.default': 'mode' },
            maxPixels: 1e13,
            region: vector.geometry().bounds()
        });
    };
    
    
    /**
     * Retrieves and filters mosaic ImageCollection by country and variables.
     * 
     * @param {Object} param - Mosaic retrieval parameters
     * @param {string} param.path - Path to mosaic collection in GEE
     * @param {string} param.country - Country code for filtering
     * @param {string[]} param.variables - Array of band names to select
     * @returns {ee.ImageCollection} Filtered mosaic collection
     */
    this.getMosaics = function(param) {
  
        var path = param.path;
        var country = param.country;
        var variables = param.variables;
        
        var mosaics = ee.ImageCollection(path).filter(ee.Filter.eq('country', country));
      
        return variables.length > 0 ? mosaics.select(variables) : mosaics;
      
    };
    
  
  
    /**
     * Adds a mosaic layer to the map for visualization.
     * 
     * @param {ee.ImageCollection} mosaics - Collection of mosaics to display
     * @param {number} year - Year to display from collection
     * @param {ee.Image} regionMask - Mask to apply to mosaic
     */
    this.addMosaic = function(mosaics, year, regionMask) {
        var yearMosaic =  mosaics.filterMetadata('year', 'equals', year);
      
        yearMosaic
            .size()
            .evaluate(function(number) {
                if(number > 0) {
                    yearMosaic = yearMosaic
                      .median()
                      .updateMask(regionMask);
                    
                    Map.addLayer(
                        yearMosaic,
                        {
                            bands: ['swir1_median', 'nir_median', 'red_median'],
                            gain: [0.08, 0.06, 0.2]
                        },
                        'MOSAICO ' + year.toString(),
                        false
                    );
                }
            });
    };
  
  
    /**
     * Adds a classification layer to the map for visualization.
     * 
     * @param {ee.Image} image - Classification image to display
     * @param {number} year - Year of classification band to show
     * @param {string[]} palette - Color palette for classification
     * @param {string} title - Title for the map layer
     */
    this.addClassification = function(image, year, palette, title) {
        ee.Number(year)
            .evaluate(function(year) {
                Map.addLayer(
                    image.select('classification_' + year),
                    {
                        min: 0,
                        max: palette.length - 1,
                        palette: palette
                    },
                    title + ' ' + year, false
                );
            });
    };
  
  
    /**
     * Retrieves the main classification image from GEE assets.
     * 
     * @param {Object} config - Configuration object
     * @param {string} config.inputPath - Path to classification assets
     * @param {string} config.country - Country code
     * @param {number} config.regionId - Region identifier
     * @param {number} config.inputVersion - Input version number
     * @returns {ee.Image} Classification image
     */
    this.getImage = function(config) {
        var inputPath = config.inputPath;
        var country = config.country;
        var regionId = config.regionId;
        var inputVersion = config.inputVersion;
      
        return ee.Image(inputPath + '/' + regionId + '-' + inputVersion);
    };
  
  
    /**
     * Connects pixels by calculating the number of connected neighbors per pixel.
     * Adds a new band for each classification band with suffix `_connected`.
     * 
     * This operation is essential for identifying isolated pixels or small patches
     * that may be removed or smoothed during spatial filtering.
     *
     * @param {ee.Image} image - Input classification image with multiple bands (one per year)
     * @param {Object} config - Configuration object
     * @param {boolean} config.eightConnected - If true, uses 8-neighbor connectivity; otherwise 4-neighbor
     * @returns {ee.Image} Image with additional bands representing connected pixel counts
     */
    this.connectPixels = function(image, config) {
        var bandNames = image.bandNames();
        var connected = image.addBands(
            image
                .connectedPixelCount(100, config.eightConnected)
                .rename(bandNames.map(
                    function (band) { return ee.String(band).cat('_connected') }
                ))
        );
      
        return connected;
    };
  
  
    /**
     * Applies a spatial filtering process to reduce noise in classification maps.
     * 
     * For each year:
     * - Identifies pixels belonging to small connected components
     * - Replaces those pixels using a focal mode (majority filter)
     * 
     * This helps eliminate isolated or spurious pixels while preserving
     * the dominant land cover structure.
     *
     * @param {ee.Image} image - Image containing classification and connected pixel bands
     * @param {Object} config - Configuration object
     * @param {number[]} config.years - List of years to process
     * @param {number} config.minConnectedPx - Minimum number of connected pixels to preserve a region
     * @returns {ee.Image} Filtered classification image with one band per year
     */
    this.applySpatialFilter = function(image, config) {
        var bandNames = image.bandNames();
        var output = ee.Image(0);
        var bands = [];
        
        config.years
            .forEach(function(year){  
                var inputImage = image.select('classification_' + year);
                var connected = image.select('classification_' + year + '_connected');
              
                var moda = inputImage
                  .focal_mode(1, 'square', 'pixels')
                  .mask(connected.lte(config.minConnectedPx));
                
                var classification = inputImage.blend(moda);
                
                output = output.addBands(classification);
                bands.push('classification_' + year);
            });
          
        return output.select(bands);
    };
  

    /**
     * Remaps classification values according to a predefined mapping.
     * 
     * This function standardizes class values by replacing original class IDs
     * with new ones defined in the `remap.layers` configuration.
     * 
     * Any class not explicitly remapped will be assigned a default value (27).
     *
     * @param {ee.Image} image - Input classification image
     * @param {Object} remap - Remapping configuration
     * @param {Object} remap.layers - Layer remapping rules
     * @param {number[]} remap.layers.from - Original class values
     * @param {number[]} remap.layers.to - Target class values
     * @returns {ee.Image} Remapped classification image
     */
    this.remapByClass = function(image, remap) {
    
        var bands = image.bandNames();
        
        var prev = image
          .select([bands.get(0)])
          .remap(remap.layers.from, remap.layers.to, 27)
          .rename([bands.get(0)]);
    
        var output = bands.slice(1)
            .iterate(
                function (bandName, previousImage) {
                    var band = ee.String(bandName);
                    var currentImage = image
                        .select(band)
                        .remap(remap.layers.from, remap.layers.to, 27)
                        .rename(band);
                    
                    previousImage = ee.Image(previousImage);
            
                    return currentImage.addBands(previousImage);
                },
                ee.Image(prev)
            );
  
        output = ee.Image(output);
    
        return output;
    
    };


    return this.init(param);
  
};


new SpatialFilter(param);