/**
 * @fileoverview Training samples generator for MapBiomas Venezuela Collection 3.
 * Generates and exports balanced training samples for machine learning classification
 * using Google Earth Engine.
 * 
 * @author MapBiomas Venezuela Team
 * @version 1.0.0
 * @see {@link https://venezuela.mapbiomas.org|MapBiomas Venezuela}
 */

/**
 * Configuration parameters for training sample generation.
 * @typedef {Object} ParamConfig
 * @property {string} user - Google Earth Engine user name for asset output
 * @property {number} regionId - Region identifier for classification
 * @property {number[]} years - Years to process for training samples
 * @property {string[]} variables - Band variables to use from mosaics
 * @property {number} samples - Target number of samples per class
 * @property {number} minSamples - Minimum samples required per class
 * @property {Object} remap - Class remapping configuration
 * @property {number[]} remap.from - Source class IDs to remap
 * @property {number[]} remap.to - Target class IDs after remapping
 * @property {string} driveFolder - Google Drive folder for exports
 * @property {number} outputVersion - Version number for output assets
 */

/**
 * Configuration object for training sample generation.
 * @type {ParamConfig}
 */
var param = {
    user: 'emanuel-valero',
    regionId: 90246,
    years: [
        2022,
        2023
    ],
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
        'hallcover_median',
        'cloud_median'
    ],
    samples: 10000,
    minSamples: 1000,
    remap: {
      from: [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 50],
      to:   [3, 4, 5, 6, 7, 9, 11, 12, 13, 21, 21, 21, 19, 20, 21, 22, 23, 24, 24, 26, 29, 24, 31, 32, 33, 34, 35, 50],
    },
    driveFolder: 'RAISG-EXPORT',
    outputVersion: 1
};




/**
 * TrainingAreas constructor - Generates and exports training samples for ML classification.
 * 
 * @param {ParamConfig} param - Configuration parameters for sample generation
 * @constructor
 */
var TrainingAreas = function(param) {
  
    var init = function(param) {
      
        var config = {
            user            : param.user,
            output          : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/SAMPLES',
            reference       : 'projects/mapbiomas-public/assets/venezuela/collection2/mapbiomas_venezuela_collection2_integration_v1',
            regions         : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette         : require('users/mapbiomas/modules:Palettes.js').get('classification8'),
            amazonMosaics   : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics   : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            rgbVariables    : ['nir_median', 'swir1_median', 'red_median'],
            rfTrees         : 50,
            mosaicVariables : param.variables,
            version         : param.outputVersion,
            driveFolder     : param.driveFolder,
            regionsField    : 'id_regionc',
            mapType         : 'SATELLITE',
            country         : 'VENEZUELA',
            samples         : param.samples,
            minSamples      : param.minSamples
        };
        
        var vis = {
            min: 0,
            max: config.palette.length - 1,
            palette: config.palette
        }
      
        var functions = require('users/Mosaico_Clasification/global-modules:mapbiomas/api').functions;
  
      
      
        // fill config with param data
        Object
            .keys(param)
            .forEach(function(key) { config[key] = param[key] });
        
      
        var region = functions
            .getRegion(config.regions, config.regionsField, config.regionId);
        
        
        
        // mosaics
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
        
  
  
        // Balanceo por años y clases 
        var reference = ee.Image(config.reference);
        
        config.years
            .forEach(function(year) {
                  
                  var selector = year === 2024 
                    ? 'classification_' + (year -1).toString()
                    : 'classification_' + year.toString()
                  
                  var lastYear = reference.select('')
                  
                  var yearReference = reference
                      .select(selector)
                      .updateMask(region.rasterMask)
                      .remap(config.remap.from, config.remap.to)
                      .rename('reference');
                  
                   
                  // get areas
                  var yearAreas = _this.applyAreas(yearReference, config.remap.to, region.vector);
                  var areasFirst = yearAreas.first();
                  

                  
                  // mosaics
                  var yearMosaic = mosaics
                      .filterMetadata('year', 'equals', year)
                      .median()
                      .updateMask(region.rasterMask)
                      .set('year', year);
                  

                  
                  // samples
                  var pointsCount = functions.pointsPerClass(yearAreas, config.samples, config.minSamples);

                  var training = functions.getSamples({
                      years: [year],
                      mosaics: ee.ImageCollection([yearMosaic]),
                      reference: yearReference,
                      classIds: pointsCount.ids,
                      pointsPerClass: pointsCount.points
                  });
                  

                  // Export and display data
                  var collection = ee.FeatureCollection(training.data.get('samples-' + year))
                      .map( function(feature) { return feature.set('year', year) });
                    
                  var filename = config.regionId + '-' + year + '-' + config.version;
                  Export.table.toAsset(collection, filename, config.output + '/' + filename);
                  
                  
                  // show to map
                  Map.addLayer(yearReference, vis, 'REFERENCIA ' + year, false);
                  Map.addLayer(training.points, { color: 'lightgrey' }, 'MUESTRAS ' + year, false);
                  
                  
                  
                  // show results to console
                  var props = areasFirst
                      .propertyNames()
                      .filter(ee.Filter.stringStartsWith('item', 'ID'));
                  
                  print('ÁREAS POR CLASE', areasFirst.toDictionary(props));
                  
                  
            });
        
    };
  
  
    var _this = this;
    
  
    /**
     * Applies area calculation for each class in the reference image.
     * 
     * @param {ee.Image} image - Reference classification image
     * @param {number[]} classes - Array of class IDs to calculate areas for
     * @param {ee.FeatureCollection} region - Region features with geometry
     * @returns {ee.FeatureCollection} Feature collection with area properties
     */
    this.applyAreas = function(image, classes, region){
  
        var uniqueClasses = classes.filter(_this.uniqueKeys);
        var areas = _this.getCoversAreas(image, region, uniqueClasses);
          
        var classFeatures = ee.FeatureCollection(
            areas.map(
                function(classObj) { return ee.Feature(null, classObj) }
            ));
            
        // Agregar las áreas como propiedades a las regiones
        var _ids = classFeatures.aggregate_array('classId');
        var _areas = classFeatures.aggregate_array('area');
        var regionWithAreas = _this.setAreasToFeatures(region, _ids, _areas);
      
        return regionWithAreas;
      
    };
  
  
    /**
     * Calculates the area (in km²) for each class in the image.
     * 
     * @param {ee.Image} image - Classification image to measure
     * @param {ee.FeatureCollection} region - Region feature collection
     * @param {number[]} classIds - Array of class IDs to calculate
     * @returns {Array<Object>} Array of objects with classId and area properties
     */
    this.getCoversAreas = function(image, region, classIds) {
        var reducer = {
            reducer: ee.Reducer.sum(),
            geometry: region.geometry(), 
            scale: 30,
            maxPixels: 1e13
        };
      
        return classIds
          .map(function(classId) {
              var imageArea = ee.Image.pixelArea()
                  .divide(1e6)
                  .mask(image.eq(classId))
                  .reduceRegion(reducer);
                
              return {
                  area: ee.Number(imageArea.get('area')).round(),
                  classId: 'ID' + classId
              };
          });
    };
  
  
    /**
     * Sets area values as properties on region features.
     * 
     * @param {ee.FeatureCollection} features - Region features to update
     * @param {ee.List} classIds - List of class IDs
     * @param {ee.List} areas - List of area values corresponding to classIds
     * @returns {ee.FeatureCollection} Features with area properties set
     */
    this.setAreasToFeatures = function(features, classIds, areas) {
        return features.map(function(feature) {
            var areaDict = ee.Dictionary.fromLists(classIds, areas);
            return feature.set(areaDict);
        });
    };
  
  
    /**
     * Filter function to get unique class keys.
     * 
     * @param {number} value - Current value in array
     * @param {number} index - Current index in array
     * @param {number[]} self - The array being filtered
     * @returns {boolean} True if value is unique
     */
    this.uniqueKeys = function(value, index, self) { return self.indexOf(value) === index};
  
  
    /**
     * Exports training samples to Google Earth Engine assets.
     * 
     * @param {Object} param - Export parameters
     * @param {number[]} param.years - Years to export
     * @param {Object} param.samples - Samples object containing training data
     * @param {string} param.path - Output asset path
     * @param {number} param.regionId - Region identifier
     * @param {number} param.outputVersion - Version number for exports
     */
    this.exportSamples = function (param) {
      
        var years = param.years;
        var samples = param.samples;
        var outputDir = param.path;
        var regionId = param.regionId;
        var version = param.outputVersion;
        
        years.forEach( function(year) {
        
            var sampleYear = samples.get('samples-' + year),
                yearInt = parseInt(year, 10);
            
            var collection = ee.FeatureCollection(sampleYear)
                .map( function(feature) {
                  return feature.set('year', yearInt);
                });
              
            // Exportar muestras
            var filename = 'TS-' + regionId + '-' + year + '-' + version;
            Export.table.toAsset(collection, filename, outputDir + '/' + filename);
            
        });
    };
    
    
    /**
     * Retrieves and filters mosaic ImageCollection by country and variables.
     * 
     * @param {Object} param - Mosaic retrieval parameters
     * @param {string} param.path - Path to mosaic collection in GEE
     * @param {string} param.country - Country code for filtering (e.g., 'VENEZUELA')
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

  
  
    // Inicia la aplicación
    return init(param);
  
};


new TrainingAreas(param);