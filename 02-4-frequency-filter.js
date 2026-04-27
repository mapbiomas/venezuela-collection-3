/**
 * @fileoverview Frequency filter for MapBiomas Venezuela Collection 3.
 * Enforces temporal consistency by analyzing the frequency of each class
 * across the entire time series and reassigning pixels based on dominant behavior.
 * 
 * @author MapBiomas Venezuela Team
 * @version 1.0.0
 * @see {@link https://venezuela.mapbiomas.org|MapBiomas Venezuela}
 */

/**
 * Configuration parameters for frequency-based filtering.
 * @typedef {Object} FrequencyParamConfig
 * @property {string} user - Google Earth Engine user name
 * @property {number} regionId - Region identifier
 * @property {string} country - Country name for filtering mosaics
 * @property {number[]} years - List of years in the time series
 * @property {number[]} classIds - Class IDs to evaluate in frequency analysis
 * @property {number[]} yearsPreview - Years to display on the map
 * @property {Object} exclusion - Exclusion configuration
 * @property {number[]} exclusion.years - Years to restore from original classification
 * @property {number[]} exclusion.classes - Classes to preserve
 * @property {Object} remap - Remapping configuration
 * @property {number[]} remap.from - Original class values
 * @property {number[]} remap.to - Target class values
 * @property {number} inputVersion - Input classification version
 * @property {number} outputVersion - Output classification version
 * @property {number} mosaicVersion - Mosaic version
 * @property {number} mosaicRegionId - Mosaic region identifier
 * @property {Object} percents - Threshold configuration
 * @property {number} percents.majority - Minimum percentage for majority class
 * @property {number} percents.naturalVegetation - Minimum percentage for vegetation mask
 */
var param = {
  
    user: 'sig3-provita',

    regionId: 90205,
    
    country: 'VENEZUELA',
    
    // Years and classes to fix
    years: ee.List.sequence(1985, 2024).getInfo(),
    
    classIds: [ 3, 4, 5, 6, 11, 12, 13, 21, 24, 25, 32, 33, 34, 35, 50 ],
    
    // Years for preview
    yearsPreview: [
        2015, 2024
    ],
  
    // exclusion
    exclusion: {
        years: [2013],
        classes: []
    },
  
    // remaps
    remap: {
        from: [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 35, 50],
        to:   [3, 4, 6, 6, 7, 9, 11, 12, 13, 14, 21, 21, 19, 20, 21, 22, 23, 24, 25, 26, 29, 24, 31, 32, 33, 34, 35, 50],
    },
  
    // Versions
    inputVersion:  12,
    
    outputVersion: 13,
    
    mosaicVersion: 5,
    
    mosaicRegionId: 902,
    
    // percents
    percents: {
        majority: 80,
        naturalVegetation: 70
    }
  
};



/**
 * FrequencyFilter constructor - Applies frequency-based filtering to classification time series.
 *
 * @param {FrequencyParamConfig} param - Configuration parameters
 * @constructor
 */
var FrequencyFilter = function(param) {
  
    var _this = this;
  
    this.init = function(param) {
    
        var config = {
            scaleNumber       : 30,
            years             : param.years,
            mapType           : 'SATELLITE',
            collectionField   : 'id_regionc',
            country           : param.country,
            regionId          : param.regionId,
            classIds          : param.classIds,
            yearsPreview      : param.yearsPreview,
            inputVersion      : param.inputVersion,
            outputVersion     : param.outputVersion,
            remapTo           : param.remap.to,
            remapFrom         : param.remap.from,
            mosaicRegionId    : param.mosaicRegionId,
            yearsToExclude    : param.exclusion.years,
            variables         : param.variables || [],
            classesToExclude  : param.exclusion.classes,
            vegetationPercent : param.percents.naturalVegetation,
            majorityPercent   : param.percents.majority,
            mosaicRegions    : [ 902, 905, 913 ],
            mosaicVersion    : param.mosaicVersion,
            mosaicVariables  : ['swir1_median', 'nir_median', 'red_median'],
            amazonMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            
            mosaicPath        : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            functions         : require('users/Mosaico_Clasification/mapbiomas:api').functions,
            inputPath         : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft/',
            outputPath        : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft/',
            regionPath        : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette           : require("users/mapbiomas/modules:Palettes.js").get('classification9')
        };


        // functions
        var getRegion = config.functions.getRegion;
        
        
        // get region vector and raster based on region id
        var region = getRegion(config);
        var vector = region.vector;
        var regionsRaster = region.rasterMask;
    
        
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
    
        
        // get classification and apply temporal filters
        var input = _this.getImage(config);

    
        // filters implementation
        var filtered = _this.frequencyFilter({
            image: input,
            classIds: config.classIds,
            vegetationPercent: config.vegetationPercent,
            majorityPercent: config.majorityPercent,
            remapFrom: config.remapFrom,
            remapTo: config.remapTo
        });

    
        // exclude years
        if(config.yearsToExclude && config.yearsToExclude.length > 0) {
            filtered = _this.excludeYears(
                input,
                filtered,
                config.yearsToExclude,
                'classification'
            );
        }
    
    
        // exclude classes
        if(config.classesToExclude && config.classesToExclude.length > 0) {
            filtered = _this.excludeCovers(
                input,
                filtered,
                config.classesToExclude
            );
        }
    

        // display to map
        config.yearsPreview
            .map(function(year){
                _this.addMosaic(mosaics, year, regionsRaster);
                _this.addClassification(input, year, config.palette, 'CLASIFICACIÓN');
                _this.addClassification(filtered, year, config.palette, 'FILTRO');
            });
    
    
        // Export asset
        var filename = config.regionId + '-' + config.outputVersion;
        var imageId = config.outputPath + filename;
    
        Export.image.toAsset({
            image: filtered
                .byte()
                .set({
                    step: 'temporal-filter'
                }),
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
  
  
    /**
     * Retrieves mosaics from ImageCollection and applies filters.
     *
     * @param {Object} param - Parameters
     * @param {string} param.path - GEE collection path
     * @param {string} param.country - Country filter
     * @param {string[]} param.variables - Bands to select
     * @returns {ee.ImageCollection} Filtered mosaics
     */
    this.getMosaics = function(param) {
  
        var path = param.path;
        var country = param.country;
        var variables = param.variables;
        
        var mosaics = ee.ImageCollection(path).filter(ee.Filter.eq('country', country));
      
        return variables.length > 0 ? mosaics.select(variables) : mosaics;
      
    };
  
  
    /**
     * Adds mosaic visualization to the map.
     * 
     * Uses median composite and applies region mask.
     *
     * @param {ee.ImageCollection} mosaic - Mosaic collection
     * @param {number} year - Year to display
     * @param {ee.Image} regionMask - Mask for region
     * @returns {void}
     */
    this.addMosaic = function(mosaic, year, regionMask) {
        var yearMosaic =  mosaic.filterMetadata('year', 'equals', year);
      
        yearMosaic
            .size()
            .evaluate(function(number) {
                if(number > 0) {
                    yearMosaic = yearMosaic.median().updateMask(regionMask);
                    
                    Map.addLayer(
                        yearMosaic,
                        {
                            bands: ['nir_median', 'swir1_median', 'red_median'],
                            min: 0,
                            max: 4000
                        },
                        'MOSAICO ' + year.toString(),
                        false
                    );
                }
            });
    };
  
  
    /**
     * Adds classification layer to the map.
     *
     * @param {ee.Image} image - Classification image
     * @param {number} year - Year to visualize
     * @param {string[]} palette - Color palette
     * @param {string} title - Layer name
     * @returns {void}
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
     * Retrieves classification image from assets.
     *
     * @param {Object} config - Configuration object
     * @param {string} config.inputPath - Base asset path
     * @param {number} config.regionId - Region identifier
     * @param {number} config.inputVersion - Version number
     * @returns {ee.Image} Classification image
     */
    this.getImage = function(config) {
        var inputPath = config.inputPath;
        var regionId = config.regionId;
        var inputVersion = config.inputVersion;
      
        return ee.Image(inputPath + regionId + '-' + inputVersion);
    };

  
    /**
     * Applies frequency-based filtering to classification time series.
     * 
     * Logic:
     * 1. Compute frequency (%) of each class across all years
     * 2. Identify pixels dominated by vegetation (or defined classes)
     * 3. Assign class if:
     *    - Pixel belongs to vegetation mask
     *    - Class frequency exceeds majority threshold
     * 
     * This reduces temporal noise by enforcing dominant land cover behavior.
     *
     * @param {Object} config - Filter parameters
     * @param {ee.Image} config.image - Input classification image
     * @param {number[]} config.classIds - Classes to evaluate
     * @param {number} config.vegetationPercent - Threshold for vegetation mask
     * @param {number} config.majorityPercent - Threshold for dominant class
     * @param {number[]} config.remapFrom - Original class values
     * @param {number[]} config.remapTo - Target class values
     * @returns {ee.Image} Filtered classification image
     */
    this.frequencyFilter = function(config) {
        var image = config.image;
        var classIds = config.classIds;
        var naturalVegetation = config.vegetationPercent;
        var majorityPercent = config.majorityPercent;
        var remapFrom = config.remapFrom;
        var remapTo = config.remapTo;
      
        // General rule
        var exp ='100*((b(0)+b(1)+b(2)+b(3)+b(4)+b(5)+b(6)+b(7)+b(8)+b(9)+b(10)+' + 
          'b(11)+b(12)+b(13)+b(14)+b(15)+b(16)+b(17)+b(18)+b(19)+b(20)+b(21)+b(22)+' +
          'b(23)+b(24)+b(25)+b(26)+b(27)+b(28)+b(29)+b(30)+b(31)+b(32)+b(33)+b(34)+' +
          'b(35)+b(36)+b(37)+b(38)+b(39))/40)';
    
        // get frequency
        var frequency = ee.Image(0);
    
        classIds
            .forEach(function (classId) {
                var frequencyClass = image
                  .eq(classId)
                  .expression(exp)
                  .rename("class" + classId);
            
                frequency = frequency.addBands(frequencyClass);
            });
    
        // Frequency mask (freq >%)
        var vegetationMask = frequency.reduce("sum");
        vegetationMask = ee.Image(0).where(vegetationMask.gt(naturalVegetation), 1);
    
        // Reclassification based on classes frequencies
        var vegetationMap = ee.Image(0);
      
        classIds.forEach(function (classId) {
            var frequencyClass = frequency.select("class" + classId);
              
            vegetationMap = vegetationMap
                .where(
                    vegetationMask.eq(1).and(frequencyClass.gt(majorityPercent)),
                    classId
                );
              
            vegetationMap = remapFrom && remapTo
                ? _this.applyRemaps(vegetationMap, config)
                : vegetationMap;
        });
      
        vegetationMap = vegetationMap.updateMask(vegetationMap.neq(0));
        return image.where(vegetationMap, vegetationMap);
    };
  
  
    /**
     * Restores original classification for specific years.
     * 
     * @param {ee.Image} original - Original classification
     * @param {ee.Image} output - Filtered classification
     * @param {number[]} yearsToExclude - Years to restore
     * @param {string} bandsPrefix - Band prefix
     * @returns {ee.Image} Updated image
     */
    this.excludeYears = function(original, output, yearsToExclude, bandsPrefix) {
        var yearsList = yearsToExclude.map(function(year) { return bandsPrefix + '_' + year });
        var bandsToExclude = ee.List(yearsList);
        
        var excluded = original.select(bandsToExclude);
        output = output.addBands(excluded, null, true);
        
        print('Excluded years: ', yearsToExclude);
        return output;
    };
  
  
    /**
     * Restores specific classes from original classification.
     *
     * @param {ee.Image} input - Original classification
     * @param {ee.Image} output - Filtered image
     * @param {number[]} classes - Class IDs to preserve
     * @returns {ee.Image} Updated image
     */
    this.excludeCovers = function(input, output, classes) {
        var classified = ee.List([]);
        
        classes.forEach(function (classId) {
          var classifiedCode = input.eq(classId).selfMask();
          classified = classified.add(input.updateMask(classifiedCode).selfMask());
        });
      
        classified = ee.ImageCollection(classified);
        classified = classified.max();
        output = output.blend(classified);
        
        print('Excluded covers: ', classes);
        return output;
    };
  
  
    /**
     * Applies class remapping to an image.
     * 
     * Reassigns class values based on predefined mapping rules.
     *
     * @param {ee.Image} input - Image to remap
     * @param {Object} rules - Remapping rules
     * @param {number[]} rules.remapFrom - Original values
     * @param {number[]} rules.remapTo - Target values
     * @returns {ee.Image} Remapped image
     */
    this.applyRemaps = function(input, rules) {
        var bands = input.bandNames().getInfo();
        var first = input.select([bands[0]]);
        
        var output = first
            .remap(rules.remapFrom, rules.remapTo, 0)
            .rename(bands[0]);
        
        bands
            .slice(1, bands.length - 1)
            .forEach(function(band) {
                var remaped = input
                    .select([band])
                    .remap(rules.remapFrom, rules.remapTo, 0)
                    .rename(band);
        
                output = output.addBands(remaped);
            });
        
        return output;
    };
    
  
  return this.init(param);

};


new FrequencyFilter(param);