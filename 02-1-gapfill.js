/**
 * @fileoverview Temporal gap fill for MapBiomas Venezuela Collection 3.
 * Fills missing years in the classification time series using temporal interpolation
 * and applies class remapping.
 * 
 * @author MapBiomas Venezuela Team
 * @version 1.0.0
 * @see {@link https://venezuela.mapbiomas.org|MapBiomas Venezuela}
 */

/**
 * Configuration parameters for gap fill operation.
 * @typedef {Object} ParamConfig
 * @property {string} user - Google Earth Engine user name
 * @property {number} regionId - Region identifier for classification
 * @property {number[]} years - Years to process for gap filling
 * @property {number[]} preview - Years to display on map
 * @property {Object} remap - Remapping configuration for layers and geometries
 * @property {number} inputVersion - Input classification version
 * @property {number} outputVersion - Output classification version
 * @property {Object} exclusion - Classes and years to exclude from gap fill
 */

/**
 * Configuration object for gap fill.
 * @type {ParamConfig}
 */
var param = {
  
    user: 'emanuel-valero',
  
    // Classification region and country
    regionId: 92530,
    
    // Years (processing and visualization)
    years: ee.List.sequence(1985, 2023).getInfo(),
    
    preview: [
        2010, 2015, 2023
    ],
    
    // Reclassify results
    remap: {
        layers: {
            from: [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 50],
            to:   [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 21, 21, 19, 20, 21, 22, 23, 24, 25, 26, 29, 24, 31, 32, 33, 34, 35, 50],
        },
        geometries: [
            {
                polygons: [ ],
                years: ee.List.sequence(1985, 2023).getInfo()
            },
        ]
    },
  
    // Version per cycle
    inputVersion:  1,
    outputVersion: 2,
    
    // List of classes to exclude in all years
    // Years not used to correct the series, but receive values if empty
    exclusion: {                                  
        clases  : [ ],
        years   : [ ],
    },
  
};




/**
 * GapFill constructor - Fills temporal gaps in classification time series.
 * 
 * @param {ParamConfig} param - Configuration parameters for gap fill
 * @constructor
 */
var GapFill = function(param) {
  
  
    this.init = function(param) {
      
        var config = {
            user             : param.user,
            scaleNumber      : 30,
            years            : param.years,
            mapType          : 'SATELLITE',
            regionsField     : 'id_regionc',
            remap            : param.remap,
            country          : 'VENEZUELA',
            regionId         : param.regionId,
            exclusion        : param.exclusion,
            preview          : param.preview,
            mosaicRegions    : [ 902, 905, 913 ],
            mosaicVersion    : param.mosaicVersion,
            mosaicRegionId   : param.mosaicRegionId,
            inputVersion     : param.inputVersion,
            outputVersion    : param.outputVersion,
            refill           : param.refill || true,
            mosaicVariables  : ['swir1_median', 'nir_median', 'red_median'],
            amazonMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            functions        : require('users/Mosaico_Clasification/global-modules:mapbiomas/api').functions,
            inputPath        : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification/',
            outputPath       : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft/',
            regionPath       : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette          : require("users/mapbiomas/modules:Palettes.js").get('classification8'),
            eePalette        : require('users/gena/packages:palettes')
        };
      
      
        // functions
        var getRegion = config.functions.getRegion;
        var remapWithPolygons = config.functions.remapWithPolygons;
      
      
        // Get region vector and raster based on region id
        var region = getRegion(config.regionPath, config.regionsField, config.regionId, config.user);
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
  
      
        // Get classification and apply gapfill
        var years = config.years;
        var image = _this.getImage(config);
        var inputImage = _this.fillMissingBands({
            inputPath: config.inputPath,
            country: config.country,
            regionId: config.regionId,
            inputVersion: config.inputVersion,
            years: years,
        });
        
      
        // Apply gapfill
        var gapfill = config.exclusion.years && config.exclusion.years.length > 0 
          ? _this.applyGapFill(inputImage, config.exclusion.years, config.remap)
          : _this.applyGapFill(inputImage, []);
          
        gapfill = config.refill
          ? _this.applyGapFill(gapfill, [])
          : gapfill;
      
        // Remap by classes
        gapfill = _this.remapByClass(gapfill, config.remap);
      
        // Remap with polygons
        config.remap.geometries
            .forEach(function(object) {
                object.years
                    .forEach(function(year) {
                      var band = 'classification_' + year;
                      var img = gapfill.select(band);
                      var fix = remapWithPolygons(img, object.polygons).rename(band);
                      gapfill = gapfill.addBands(fix, null, true);
                    });
          });
        
      
      
      
      
        // Display to map
        config.preview
            .map(
              function(year){
                  _this.addMosaic(mosaics, year, regionsRaster);
                  _this.addClassification(inputImage, year, config.palette, 'CLASSIFICATION');
                  _this.addClassification(gapfill, year, config.palette, 'GAPFILL');
              });
      
      
        // Export asset
        var filename = config.regionId + '-' + config.outputVersion;
        var imageId = config.outputPath + filename;
      
        Export.image.toAsset({
            image: gapfill.byte(),
            description: filename,
            assetId: imageId,
            scale: config.scaleNumber,
            pyramidingPolicy: {
              '.default': 'mode'
            },
            maxPixels: 1e13,
            region: vector.geometry().bounds()
        });
      
    };
  
  
    var _this = this;
    
    
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
                    image,
                    {
                        bands: ['classification_' + year],
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
        
        return ee.Image(inputPath + regionId + '-' + inputVersion);
    };
  
   
    /**
     * Fills missing year bands in the classification time series.
     * Adds placeholder bands (value 27) for missing years and merges with existing bands.
     * 
     * @param {Object} config - Configuration object
     * @param {string} config.inputPath - Path to classification assets
     * @param {string} config.country - Country code
     * @param {number} config.regionId - Region identifier
     * @param {number} config.inputVersion - Input version number
     * @param {number[]} config.years - Array of years to process
     * @returns {ee.Image} Image with all year bands present
     */
    this.fillMissingBands = function(config) {
        var inputPath = config.inputPath;
        var country = config.country;
        var regionId = config.regionId;
        var inputVersion = config.inputVersion;
        var years = config.years;
        
        var inputImage = ee.Image(inputPath + regionId + '-' + inputVersion);
        var bandNames = ee.List(years.map(function (year) { return 'classification_' + year }));
        var outputImage;
      
        if(inputPath.indexOf('-ft/') === -1) {
        
            var original = inputImage;
            
            // Get band names
            var bandnameReg = inputImage.bandNames();
            var missingBands = bandNames.removeAll(bandnameReg);
        
            // Set pixel value 27 for mask areas
            var missingImages = ee.ImageCollection(
                ee.Algorithms.If(
                    ee.Algorithms.IsEqual(missingBands.size(), 0),
                    ee.ImageCollection([]),
                    ee.ImageCollection(
                        missingBands.map(
                          function(band) {
                            var stringBand = ee.String(band);
                            var stringYear = stringBand.slice(-4);
                            return ee.Image(27).rename(stringBand).set('year', stringYear);
                          }
                        )
                    )
                )
            );
        
            // Get valid classification images
            var validImages = ee.ImageCollection(
                bandnameReg.map(
                    function(bandName) {
                        var stringYear = ee.String(bandName).slice(-4);
                        return inputImage.select([bandName]).set('year', stringYear);
                    }
                )
            );
        
            // Merge valid and missing images
            var classification = missingImages.merge(validImages)
                .map(function(image) {
                    return image.updateMask(image.unmask().neq(27));
                })
                .sort('year')
                .toBands();
          
            outputImage = classification.select(classification.bandNames(), bandNames);
        }
  
        else {
            outputImage = inputImage.select(inputImage.bandNames(), bandNames);
        }
        
        
        print('OUTPUT', outputImage);
        return outputImage;
      
    };
  
  
    /**
     * Applies temporal gap fill using forward and backward interpolation.
     * Fills missing pixels by propagating values from adjacent years in both directions.
     * 
     * @param {ee.Image} image - Classification image with year bands
     * @param {number[]} yearsToExclude - Years to exclude from gap filling
     * @param {Object} remap - Remapping configuration
     * @returns {ee.Image} Gap-filled classification image
     */
    this.applyGapFill = function (image, yearsToExclude, remap) {
        var bands = image.bandNames();
        var original = image;
        
        if(yearsToExclude && yearsToExclude.length > 0) {
          yearsToExclude
            .forEach(
              function(year) {
                var name = 'classification_' + year;
                var maskYear = ee.Image(27).neq(27).selfMask().rename(name);
                image = image.addBands(maskYear, [name], true);
              }
            );
        }
      
        // apply the gap fill form t0 until tn
        var imageFilledt0tn = bands.slice(1)
            .iterate(
                function (bandName, previousImage) {
                    var currentImage = image.select(ee.String(bandName));
                    
                    previousImage = ee.Image(previousImage);
                    currentImage = currentImage.unmask(previousImage.select([0]));
            
                    return currentImage.addBands(previousImage);
                },
                ee.Image(image.select([bands.get(0)]))
            );
      
        imageFilledt0tn = ee.Image(imageFilledt0tn);
    
    
        // apply the gap fill form tn until t0
        var bandsReversed = bands.reverse();
    
        var imageFilledtnt0 = bandsReversed.slice(1)
            .iterate(
                function (bandName, previousImage) {
          
                    var currentImage = imageFilledt0tn.select(ee.String(bandName));
                    previousImage = ee.Image(previousImage);
            
                    currentImage = currentImage
                        .unmask(previousImage
                            .select(previousImage.bandNames().length().subtract(1))
                        );
            
                    return previousImage.addBands(currentImage);
          
                },
                ee.Image(imageFilledt0tn.select([bandsReversed.get(0)]))
            );
      
        imageFilledtnt0 = ee.Image(imageFilledtnt0).select(bands);
      
      
        var output = yearsToExclude && yearsToExclude.length > 0
          ? _this.excludeYears(original, imageFilledtnt0, yearsToExclude,'classification')
          : imageFilledtnt0;
      
      
        return output;
  
    };
  
  
    /**
     * Excludes specified years from the gap-filled output, preserving original values.
     * 
     * @param {ee.Image} original - Original classification image
     * @param {ee.Image} output - Gap-filled classification image
     * @param {number[]} yearsToExclude - Years to exclude from gap fill
     * @param {string} bandsPrefix - Prefix for band names (e.g., 'classification')
     * @returns {ee.Image} Image with excluded years preserved
     */
    this.excludeYears = function(original, output, yearsToExclude, bandsPrefix) {
        var bandsToExclude = ee.List(
          yearsToExclude.map(function(year) { return bandsPrefix + '_' + year })
        );
        
        var excluded = original.select(bandsToExclude);
        output = output.addBands(excluded, null, true);
        
        print('Excluded years: ', yearsToExclude);
        return output;
    };
  
  
    /**
     * Remaps classification values using class mapping configuration.
     * Applies the remap layers to all year bands in the image.
     * 
     * @param {ee.Image} image - Classification image to remap
     * @param {Object} remap - Remap configuration with layers.from and layers.to arrays
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



new GapFill(param);