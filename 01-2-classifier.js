/**
 * @fileoverview Random Forest classifier for MapBiomas Venezuela Collection 3.
 * Performs supervised pixel-by-pixel classification using Google Earth Engine
 * with SmileRandomForest algorithm.
 * 
 * @author MapBiomas Venezuela Team
 * @version 1.0.0
 * @see {@link https://venezuela.mapbiomas.org|MapBiomas Venezuela}
 */

/**
 * Configuration parameters for classification.
 * @typedef {Object} ParamConfig
 * @property {string} user - Google Earth Engine user name
 * @property {number} regionId - Region identifier for classification
 * @property {number[]} years - Years to process for classification
 * @property {number[]} preview - Years to display on map
 * @property {Object} remap - Remapping configuration for samples and polygons
 * @property {number[]} removeSamples - Class IDs to exclude from training
 * @property {Object} additionalSamples - Additional training samples configuration
 * @property {string[]} variables - Band variables for classification
 * @property {string} driveFolder - Google Drive folder for exports
 * @property {number} samplesVersion - Version of training samples
 * @property {number} outputVersion - Version number for output
 */

/**
 * Configuration object for classification.
 * @type {ParamConfig}
 */
var param = {
  
    user: 'emanuel-valero',
    regionId: 90246,
  
    // Years (processing and visualization)
    years: [
        2022,
        2023,
        2024
    ],
  
    preview: [
        2024
    ],
  
    // Reclassify samples or classified areas
    remap: {
        samples: {
            from: [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 50],
            to:   [3, 4, 6, 6, 7, 9, 11, 12, 13, 14, 21, 21, 19, 20, 21, 22, 23, 24, 25, 26, 29, 24, 31, 32, 33, 34, 35, 50],
        },
        polygons: [
            //remap_to_6,
            //remap_to_11,
        ]
    },
  
    // Remove ("mask") samples by class
    removeSamples: [
  
    ],
    
    // Assign complementary samples
    // Requires adding the id of each complementary class and the respective number of points
    additionalSamples: {
        polygons: [ ],
        classes: [ 11, 21],
        points: [ 3000, 1000 ]             
    },
    
    // Feature space
    variables: [
        'red_median',
        'nir_median',
        'swir1_median',
        'ndfi_median',
        'gv_median',
        'gvs_median',
        'npv_median',
        'soil_median',
        'gcvi_median',
        'pri_median',
        'evi2_median',
        'ndvi_median',
        'savi_median',
    ],
  
    driveFolder: 'RF-PRELIMINAR-CLASSIFICATION',
    samplesVersion: 1,
    outputVersion: 1
    
};




/**
 * Classification constructor - Performs Random Forest supervised classification.
 * 
 * @param {ParamConfig} param - Configuration parameters for classification
 * @constructor
 */
var Classification = function(param) {
  
    var init = function(param) {
      
        var config = {
            user              : param.user,
            amazonMosaics     : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics     : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            outputPath        : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification',
            samplesPath       : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/SAMPLES',
            regions           : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette           : require('users/mapbiomas/modules:Palettes.js').get('classification8'),
            rgbBands          : ['swir1_median', 'nir_median', 'red_median'],
            years             : param.years,
            country           : 'VENEZUELA',
            mosaicVariables   : param.variables,
            outputVersion     : param.outputVersion,
            remap             : param.remap,
            additionalSamples : param.additionalSamples,
            removeSamples     : param.removeSamples,
            regionsField      : 'id_regionc',
            mapType           : 'SATELLITE',
            tileScale         : 8,
            trees             : 100,
        };
      
        var functions = require('users/Mosaico_Clasification/global-modules:mapbiomas/api').functions;
      
        // fill config with param data
        Object
            .keys(param)
            .forEach(function(key) { config[key] = param[key] });
  
      
        // Get functions
        var getRegion = functions.getRegion;
        var remapWithPolygons = functions.remapWithPolygons;
        
        
        // Set up regions and years
        var region = functions.getRegion(config.regions, config.regionsField, config.regionId);
        var years = config.years;
        var vector = region.vector;
        var rasterMask = region.rasterMask;
            
        // Mosaics
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
  
      
        // Visualization configs
        var classified = ee.Image(0);
        var palette = config.palette;
        var classificationVis = { min: 0, max: palette.length - 1, palette: palette };
        var maosaicVis = { bands: config.rgbBands, gain: [0.08, 0.06, 0.2] };
  
      
        years.forEach(function(year, error) {
            
            try {
              
                var yearMosaic = mosaics
                    .filterMetadata('year', 'equals', year)
                    .median()
                    .updateMask(rasterMask);
                  
                var bands = yearMosaic.bandNames();
                var contained = bands.containsAll(ee.List(config.variables));
                
                var samplesNames =  config.regionId + '-' + year + '-' + config.samplesVersion;
                var yearTrainingSamples = ee.FeatureCollection(config.samplesPath + '/' + samplesNames)
                    .remap(config.remap.samples.from, config.remap.samples.to, 'reference')
                    .filter(ee.Filter.notNull(bands));
                
                // Remove undesired samples  
                yearTrainingSamples = config.removeSamples
                    ? yearTrainingSamples.filter(ee.Filter.inList('reference', config.removeSamples).not())
                    : yearTrainingSamples;
              
              
                // Add additional samples
                if(config.additionalSamples.polygons.length > 0){
                    yearTrainingSamples = _this.applyResampling({
                        region: vector,
                        mosaic: yearMosaic,
                        additionalSamples: param.additionalSamples,
                        tileScale: param.tileScale,
                        samples: yearTrainingSamples,
                    });
                }
              
                // Apply classification
                var nClasSample = _this.identifyClasses(contained, yearTrainingSamples, ['reference']);
              
                classified = _this.applyClassification({
                    trees: config.trees,
                    conditionClassId: contained,
                    nClasSample: nClasSample,
                    samples: yearTrainingSamples,
                    mosaic: yearMosaic,
                    classified: classified,
                    rasterMask: region.rasterMask,
                    bands: bands,
                    year: year,
                });
              
                // Set up final remaps to results
                if(config.remap.polygons && config.remap.polygons.length > 0) {
                    classified = _this.applyRemaps({
                        year: year,
                        image: classified,
                        polygons: param.remap.polygons,
                        algorithm: remapWithPolygons
                    });
                }
  
                // display mosaic and classification
                if(config.preview.indexOf(year) > -1) {
                    _this.addMosaic(mosaics, year, rasterMask);
                    _this.addClassification(classified, year, config.palette, 'CLASIFICACIÓN');
                }
          
            }
            catch(error) { print(error.message) }
      
        });
      
      
        classified = classified.slice(1).toInt8()
            .set({
                code_region: config.regionId,
                pais: config.country,
                version: config.outputVersion,
                RFtrees: config.trees,
                samples_version: config.samplesVersion,
                descripcion: 'clasificacion-1',
            });
        
        print('RESULT ', classified);
    
        // Export assets to GEE and Google Drive
        var filename = config.regionId + '-' + config.outputVersion;
        var imageId = config.outputPath + '/' + filename;  
        var tableName = 'IMPORTANCE-TABLE-' + config.country + '-';
        tableName = tableName + config.regionId + '-' + config.outputVersion;
        
        
        Export.image.toAsset({
            image: classified,
            description: filename,
            assetId: imageId,
            scale: 30,
            pyramidingPolicy: { '.default': 'mode' },
            maxPixels: 1e13,
            region: region.vector.geometry().bounds()
        });
          
        
        Export.image.toDrive({
            image: classified,
            description: filename + '-DRIVE',
            folder: config.driveFolder,
            scale: 30,
            maxPixels: 1e13,
            region: region.vector.geometry().bounds()
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
     * Resamples cover classes within polygons for additional training samples.
     * 
     * @param {ee.Image} mosaic - Image mosaic to sample from
     * @param {Object} additionalSamples - Object with polygons, classes, and points
     * @param {number} tileScale - Tile scale for sampling
     * @returns {ee.FeatureCollection} New training samples from specified polygons
     */
    this.resampleCover = function(mosaic, additionalSamples, tileScale) {
    
        var polygons = additionalSamples.polygons,
            classIds = additionalSamples.classes,
            points = additionalSamples.points,
            newSamples = [];
      
        polygons.forEach(function(polygon, i) {
          
            var newSample = mosaic.sample({
                numPixels: points[ i ],
                region: polygon.geometry(),
                scale: 30,
                projection: 'EPSG:4326',
                seed: 1,
                geometries: true,
                tileScale: tileScale
            })
            .map(function(item) { return item.set('reference', classIds[ i ]) });
            
            newSamples.push(newSample);
      
        });
      
        return ee.FeatureCollection(newSamples).flatten();
    
    };
  
  
    /**
     * Identifies the number of distinct classes in the training samples.
     * 
     * @param {ee.Boolean} condition - Condition to check if bands are present
     * @param {ee.FeatureCollection} samples - Training samples collection
     * @param {string[]} bandNames - Band names to extract class IDs from
     * @returns {ee.Number} Number of distinct classes in samples
     */
    this.identifyClasses = function(condition, samples, bandNames) {
      
        var nclass = ee.List(
            ee.Algorithms.If(
                condition,
                samples
                  .reduceColumns(ee.Reducer.toList(), bandNames)
                  .get('list'),
                null
            )
        );
        
        // Identify number of classes in the samples.
        nclass = nclass.reduce(ee.Reducer.countDistinct());
        
        return nclass;
      
    };
  
  
    /**
     * Applies Random Forest classification to the mosaic image.
     * 
     * @param {Object} param - Classification parameters
     * @param {number} param.trees - Number of trees in Random Forest
     * @param {ee.Boolean} param.conditionClassId - Condition for class identification
     * @param {ee.Number} param.nClasSample - Number of classes in samples
     * @param {ee.FeatureCollection} param.samples - Training samples
     * @param {ee.Image} param.mosaic - Image mosaic to classify
     * @param {ee.Image} param.classified - Current classified image
     * @param {ee.Image} param.rasterMask - Region raster mask
     * @param {ee.List} param.bands - Band names for classification
     * @param {number} param.year - Year being processed
     * @returns {ee.Image} Classified image with new band added
     */
    this.applyClassification = function(param) {
  
        var trees = param.trees;
        var conditionClassId = param.conditionClassId;
        var nClasSample = param.nClasSample;
        var samples = param.samples;
        var bands = param.bands;
        var mosaic = param.mosaic;
        var classified = param.classified;
        var year = param.year;
        var rasterMask = param.rasterMask;
      
        var classifier = ee.Classifier.smileRandomForest({
            numberOfTrees: trees, 
            variablesPerSplit: 1
        });
      
        classifier = ee.Classifier(
            ee.Algorithms.If(
                conditionClassId,
                ee.Algorithms.If(
                    // Solution to problem of 'only one class'
                    ee.Algorithms.IsEqual(nClasSample, 1),
                    null,
                    classifier.train(samples, 'reference', bands)
                ),
                null
            )
        );
          
        var explainer = ee.Dictionary(
            ee.Algorithms.If(
                conditionClassId,
                ee.Algorithms.If(
                    ee.Algorithms.IsEqual(nClasSample, 1) ,
                    null,
                    classifier.explain()
                ),
                null
            )
        );
          
        // Compute classification
        var img = mosaic.classify(classifier)
            .select(['classification'], ['classification_' + year]);
              
        var maskBand = ee.Image(27).rename('classification_' + year);
        
    
        classified = ee.Image(
            ee.Algorithms.If(
                conditionClassId,
                ee.Algorithms.If(
                    // Solution to problem of 'only one class'
                    ee.Algorithms.IsEqual(nClasSample, 1),
                    classified.addBands(maskBand),
                    classified.addBands(img)
                ),
                classified.addBands(maskBand)
            )
        )
        .unmask(27)
        .updateMask(rasterMask)
        .toByte();
        
        
        return classified;
      
    };
  
  
    /**
     * Applies resampling to add additional training samples outside existing polygons.
     * 
     * @param {Object} param - Resampling parameters
     * @param {ee.FeatureCollection} param.region - Region feature collection
     * @param {ee.Image} param.mosaic - Image mosaic to sample from
     * @param {Object} param.additionalSamples - Additional samples config
     * @param {number} param.tileScale - Tile scale for sampling
     * @param {ee.FeatureCollection} param.samples - Current training samples
     * @returns {ee.FeatureCollection} Combined training samples
     */
    this.applyResampling = function(param) {
        var region = param.region;
        var mosaic = param.mosaic;
        var additionalSamples = param.additionalSamples;
        var tileScale = param.tileScale;
        var samples = param.samples;
      
        var geom = ee.FeatureCollection(region.geometry().bounds())
            .map(function(item) { return item.set('version', 1) })
            .reduceToImage(['version'], ee.Reducer.first());
          
        var insidePolygons = ee.FeatureCollection(additionalSamples.polygons)
            .reduceToImage(['id'], ee.Reducer.first());
          
        var outsidePolygons = insidePolygons.mask().eq(0).selfMask();
        outsidePolygons = geom.updateMask(outsidePolygons);
    
        var outsideVector = outsidePolygons.reduceToVectors({
            reducer: ee.Reducer.countEvery(),
            geometry: region.geometry().bounds(),
            scale: 30,
            maxPixels: 1e13
        });
      
        var newSamples = _this.resampleCover(mosaic, additionalSamples, tileScale);
        
        samples = samples
            .filterBounds(outsideVector)
            .merge(newSamples);
        
        return samples;
    };
  
  
    /**
     * Applies polygon-based remapping to classification results.
     * 
     * @param {Object} param - Remap parameters
     * @param {ee.Image} param.image - Classification image to remap
     * @param {ee.FeatureCollection} param.polygons - Polygons for remapping
     * @param {number} param.year - Year of classification band
     * @param {Function} param.algorithm - Remapping algorithm function
     * @returns {ee.Image} Image with remapped band added
     */
    this.applyRemaps = function(param) {
        var image = param.image;
        var polygons = param.polygons;
        var year = param.year;
        var algorithm = param.algorithm;
        
        var band = 'classification_' + year;
        var selected = image.select(band);
        var remaped = algorithm(selected, polygons).rename(band);
    
        return image.addBands(remaped, ee.List([band]), true);
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
  
  
    return init(param);
  
};


new Classification(param);