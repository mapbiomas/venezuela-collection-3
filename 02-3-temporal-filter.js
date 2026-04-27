var param = {
    
    // Users
    user: 'emanuel-valero',
    
    regionId: 90227,

    country: 'VENEZUELA',
  
    // Years to fix
    years: ee.List.sequence(1985, 2024).getInfo(),
  
    // Years for preview
    yearsPreview: [
        1986, 2011, 2015
    ],
  
    // exclusion
    exclusion: {
        years: [],
        classes: [30]
    },
  
    // Versions
    inputVersion:  '3',
    outputVersion: '1-1',
    overwrite: false,
    
    mosaicVersion: 5,
    mosaicRegionIds: [902, 905, 913],
    
    filterExecution: [
        // Ejemplos:
        // Filtro de primer año: X 3 3 => 3 3 3
        // Filtro de años intermedios:
        // - 3 años: 21 X 21 => 21 21 21,
        // - 4 años: 21 X 21 21 => 21 21 21 21
        // - 5 años: 21 X 21 21 => 21 21 21 21 21
        // Filtro de último año: 24 24 X => 24, 24, 24 
    
        // ´Último, Primero, 3, 4, 5, 3, 4, 3
        { name: 'last3',   order: [6, 9, 11, 13, 21, 24, 30, 3, 12, 33] },
        { name: 'first3',  order: [6, 9, 11, 13, 21, 24, 30, 3, 12, 33] },
        { name: 'middle3', order: [6, 9, 11, 13, 21, 24, 30, 3, 12, 33] },
        { name: 'middle4', order: [6, 9, 11, 13, 21, 24, 30, 3, 12, 33] },
        { name: 'middle5', order: [6, 9, 11, 13, 21, 24, 30, 3, 12, 33] }
    ]
    
};


/**
 * TemporalFilter constructor - Applies temporal consistency rules to classification time series.
 * 
 * This filter removes temporal noise (spikes) in classification by enforcing
 * logical consistency across consecutive years.
 * 
 * @param {TemporalParamConfig} param - Configuration parameters
 * @constructor
 */
var TemporalFilter = function(param) {
  
    this.init = function(param) {
      
        var config = {
            scaleNumber      : 30,
            years            : param.years,
            mapType          : 'SATELLITE',
            regionsField     : 'id_regionc',
            country          : param.country,
            regionId         : param.regionId,
            overwrite        : param.overwrite,
            yearsPreview     : param.yearsPreview,
            inputVersion     : param.inputVersion,
            mosaicVersion    : param.mosaicVersion,
            outputVersion    : param.outputVersion,
            yearsToExclude   : param.exclusion.years,
            classesToExclude : param.exclusion.classes,
            mosaicRegionIds  : param.mosaicRegionIds,
            variables        : param.variables || [],
            filterExecution  : param.filterExecution,
            amazonMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
            caribeMosaics    : 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
            functions        : require('users/Mosaico_Clasification/mapbiomas:api').functions,
            inputPath        : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft',
            outputPath       : 'projects/' + param.user + '/assets/MAPBIOMAS-VENEZUELA/LANDSAT/COLLECTION3/GENERAL/classification-ft',
            regions          : 'projects/mapbiomas-venezuela/assets/DATOS-AUXILIARES/VECTORES/ve-regiones-clasificacion',
            palette          : require("users/mapbiomas/modules:Palettes.js").get('classification8')
        };
      
        var functions = require('users/Mosaico_Clasification/global-modules:mapbiomas/api').functions;
  
  
        // set up regions and years
        var region = functions.getRegion(config.regions, config.regionsField, config.regionId);
        var years = config.years;
        var vector = region.vector;
        var regionMask = region.rasterMask;

      
        // mosaics
        var amazonMosaics = _this.getMosaics({
            path: config.amazonMosaics,
            country: config.country,
            variables: config.variables,
        });
        
        var caribeMosaics = _this.getMosaics({
            path: config.caribeMosaics,
            country: config.country,
            variables: config.variables,
        });
        
        var mosaics = amazonMosaics.merge(caribeMosaics);
      
      
        // get classification and apply temporal filters
        var input = _this.getImage(config);
        var inputImage = _this.fillMissingBands(config);
        var filtered = inputImage;


        // apply temporal filters
        config.filterExecution
            .forEach(function(filter) {
                filtered = _this.applyFilter(
                    {
                        image: filtered,
                        years: config.years,
                        idsOrder: filter.order, 
                        filterName: filter.name
                    }  
                );
            });
  
      
        // exclude years
        if(config.yearsToExclude && config.yearsToExclude.length > 0) {
            filtered = _this.excludeYears(
                inputImage,
                filtered,
                config.yearsToExclude,
                'classification'
            );
        }
      
      
        // exclude classes
        if(config.classesToExclude && config.classesToExclude.length > 0) {
            filtered = _this.excludeCovers(
                inputImage,
                filtered,
                config.classesToExclude
            );
        }
      
  
        // display to map
        config.yearsPreview
            .map(
              function(year){
                  _this.addMosaic(mosaics, year, regionMask);
                  _this.addClassification(inputImage, year, config.palette, 'CLASIFICACIÓN');
                  _this.addClassification(filtered, year, config.palette, 'FILTRO');
              });
      
      
        // Export asset
        var filename = config.regionId + '-' + config.outputVersion;
        var imageId = config.outputPath + '/' + filename;

        if(config.overwrite) {
            try { ee.data.deleteAsset(imageId) }
            catch(error) { print(error.message) }
        }
  
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
  
  
    var _this = this;
    

    /**
     * Retrieves mosaics from a given ImageCollection path.
     * 
     * Optionally filters by country and selects specific bands.
     *
     * @param {Object} param - Mosaic parameters
     * @param {string} param.path - GEE path to mosaic collection
     * @param {string} param.country - Country filter
     * @param {string[]} param.variables - Bands to select
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
     * The mosaic is composited and masked to the region.
     *
     * @param {ee.ImageCollection} mosaic - Mosaic collection
     * @param {number} year - Year to display
     * @param {ee.Image} regionMask - Mask for region
     * @returns {void}
     */
    this.addMosaic = function(mosaic, year, regionMask) {

        var yearMosaic =  mosaic
            .filterMetadata('year', 'equals', year)
            .mosaic()
            .updateMask(regionMask);

        try {
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
        catch(error) {
            print(error.message);
        }
  
    };
  
  
    /**
     * Adds a classification layer to the map.
     *
     * @param {ee.Image} image - Classification image
     * @param {number} year - Year to visualize
     * @param {string[]} palette - Color palette
     * @param {string} title - Layer title
     * @returns {void}
     */
    this.addClassification = function(image, year, palette, title) {
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
    };

  
    /**
     * Retrieves classification image from assets.
     * 
     * @param {Object} config - Configuration object
     * @param {string} config.inputPath - Base path
     * @param {number} config.regionId - Region ID
     * @param {string|number} config.inputVersion - Version
     * @returns {ee.Image} Classification image
     */
    this.getImage = function(config) {
      
        var inputPath = config.inputPath;
        var regionId = config.regionId;
        var inputVersion = config.inputVersion;
        
        return ee.Image(inputPath + '/' + regionId + '-' + inputVersion);
        
    };
  
  
    /**
     * Fills missing classification bands (years) with default value (27).
     * 
     * Ensures temporal continuity by creating missing year bands
     * and merging them with existing ones.
     *
     * @param {Object} config - Configuration object
     * @param {string} config.inputPath
     * @param {number} config.regionId
     * @param {string|number} config.inputVersion
     * @param {number[]} config.years
     * @returns {ee.Image} Complete classification image with all years
     */
    this.fillMissingBands = function(config) {
      
        var inputPath = config.inputPath;
        var regionId = config.regionId;
        var inputVersion = config.inputVersion;
        var years = config.years;
      
        var inputImage = ee.Image(inputPath + '/' + regionId + '-' + inputVersion);
        var bandNames = ee.List(years.map(function (year) { return 'classification_' + year }));
      
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
                    ))
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
    
        
        return classification.select(classification.bandNames(), bandNames);
        
    };
  
  
    /**
     * Applies a temporal filter across all years for a given rule.
     * 
     * Iterates over class IDs and applies the corresponding
     * temporal window function.
     *
     * @param {Object} param - Filter parameters
     * @param {ee.Image} param.image - Input classification image
     * @param {number[]} param.years - Years to process
     * @param {number[]} param.idsOrder - Class priority order
     * @param {string} param.filterName - Filter type (e.g. middle3, middle4)
     * @param {string} [param.bandsPrefix='classification'] - Band prefix
     * @returns {ee.Image} Filtered image
     */
    this.applyFilter = function(param) {
      
        var image = param.image;
        var idsOrder = param.idsOrder; 
        var filterName = param.filterName;
        var years = param.years;
        var prefix = param.bandsPrefix || 'classification';
  
        idsOrder
            .forEach(function(classId) {
                image = _this.windows[filterName](image, classId, years, prefix);
            });
          
        return image;
        
    };
  

    /**
     * Temporal mask definitions.
     * 
     * Each function defines a rule to correct temporal inconsistencies
     * based on neighboring years.
     *
     * Rules:
     * - middle3: X Y X → X X X
     * - middle4: X Y Y X → X X X X
     * - middle5: X Y Y Y X → X X X X X
     * - first3 : Y X X → X X X (inicio de serie)
     * - last3  : X X Y → X X X (final de serie)
     *
     * @type {Object<string, Function>}
     */
    this.masks = {
      
        middle3 : function(value, year, image, prefix) {
            // get the images based on year
            var year1 = image.select(prefix + '_' + (year - 1));
            var year2 = image.select(prefix + '_' + year);
            var year3 = image.select(prefix + '_' + (year + 1));
        
            // define the filter rule
            var mask = year1.eq(value)
                .and(year2.neq(value))
                .and(year3.eq (value));
              
            var remaped = image
                .select(prefix + '_' + year)
                .mask(mask.eq(1))
                .where(mask.eq(1), value);
              
            var output = image
                .select(prefix + '_' + year)
                .blend(remaped);
            
            return output;
        },
    
        middle4 : function(value, year, image, prefix) {
            // select years
            var year1 = image.select(prefix + '_' + (year - 1));
            var year2 = image.select(prefix + '_' + year);
            var year3 = image.select(prefix + '_' + (year + 1));
            var year4 = image.select(prefix + '_' + (year + 2));
            
            // define the filter rule
            var mask = year1.eq(value)
                .and(year2.neq(value))
                .and(year3.neq(value))
                .and(year4.eq(value));
            
            // apply the rule
            var remaped0 = year2.mask(mask.eq(1)).where(mask.eq(1), value);  
            var remaped1 = year3.mask(mask.eq(1)).where(mask.eq(1), value);
            var output = year2.blend(remaped0).blend(remaped1);
          
            return output;
        },
    
        middle5 : function(value, year, image, prefix) {
            // select years
            var year1 = image.select(prefix + '_' + (year - 1));
            var year2 = image.select(prefix + '_' + year);
            var year3 = image.select(prefix + '_' + (year + 1));
            var year4 = image.select(prefix + '_' + (year + 2));
            var year5 = image.select(prefix + '_' + (year + 3));
          
            // define the filter rule
            var mask = year1.eq(value)
                .and(year2.neq(value))
                .and(year3.neq(value))
                .and(year4.neq(value))
                .and(year5.eq(value));
          
            var muda_img  = year2.mask(mask.eq(1)).where(mask.eq(1), value);  
            var muda_img1 = year3.mask(mask.eq(1)).where(mask.eq(1), value);  
            var muda_img2 = year4.mask(mask.eq(1)).where(mask.eq(1), value);  
            var output = year2.blend(muda_img).blend(muda_img1).blend(muda_img2);
          
            return output;
        },
        
        first3: function(value, years, image, prefix) {
            // get first three images
            var baseYear = years[0];
            var year1 = image.select(prefix + '_' + baseYear);
            var year2 = image.select(prefix + '_' + (baseYear + 1));
            var year3 = image.select(prefix + '_' + (baseYear + 2));
            
            // define the filter rule
            var mask = year1.neq(value)
                .and(year2.eq(value))
                .and(year3.eq(value));
            
            // apply the rule
            var outputBands = image.bandNames().slice(1);
            var remaped = year1.mask(mask.eq(1)).where(mask.eq(1), value);  
            var output = year1.blend(remaped);
            
            output = output.addBands(image.select(outputBands));
            return output;
        },
    
        last3 : function(value, years, image, prefix) {
            // get first three images
            var baseYear = years.slice(-3)[0];
            var year1 = image.select(prefix + '_' + baseYear);
            var year2 = image.select(prefix + '_' + (baseYear + 1));
            var year3 = image.select(prefix + '_' + (baseYear + 2));
            
            // define the filter rule
            var mask = year1.eq(value)
                .and(year2.eq(value))
                .and(year3.neq(value));
            
            // apply the rule
            var bands = image.bandNames();
            var firstBand = ee.String(bands.get(0));
            var outputBands = bands.slice(1, years.length - 1);
            
            var remaped = year3.mask(mask.eq(1)).where(mask.eq(1), value);  
            var output = image.select(firstBand).addBands(image.select(outputBands));
            output = output.addBands(year3.blend(remaped));
            return output;
        }
        
    };
  
  
    /**
     * Temporal window functions.
     * 
     * These functions apply masks across the full time series,
     * ensuring proper handling of edge years.
     *
     * @type {Object<string, Function>}
     */
    this.windows = {
      
        middle3 : function(image, value, years, prefix) {
            var start = years[0];
            var finish = years.slice(-1)[0];
            
            var output = image.select(prefix + '_' + start);
            years
                .slice(1)
                .forEach(
                    function(year) {
                        output = year < finish
                            ? output.addBands(_this.masks.middle3(value, year, image, prefix))
                            : output.addBands(image.select(prefix + '_' + year));
                    }
                );
              
             return output;
        },
      
        middle4 : function(image, value, years, prefix){
            var start = years[0];
            var finish = years.slice(-2)[0];
          
            var output = image.select(prefix + '_' + start);
            years
                .slice(1)
                .forEach(
                    function(year) {
                        output = year < finish
                            ? output.addBands(_this.masks.middle4(value, year, image, prefix))
                            : output.addBands(image.select(prefix + '_' + year));
                    }
                );
            
            return output;
        },
      
        middle5 : function(image, value, years, prefix){
            var start = years[0];
            var finish = years.slice(-3)[0];
          
            var output = image.select(prefix + '_' + start);
            years
                .slice(1)
                .forEach(
                    function(year) {
                        output = year < finish
                            ? output.addBands(_this.masks.middle5(value, year, image, prefix))
                            : output.addBands(image.select(prefix + '_' + year));
                    }
                );
              
           return output;
    
        },
      
        last3: function(image, value, years, prefix) {
            return _this.masks.last3(value, years, image, prefix);
        },
      
        first3: function(image, value, years, prefix) {
            return _this.masks.first3(value, years, image, prefix);
        },
        
    };
  
  
    /**
     * Restores original classification values for specific years.
     * 
     * Useful when certain years should not be altered by temporal filtering.
     *
     * @param {ee.Image} original - Original classification image
     * @param {ee.Image} output - Filtered image
     * @param {number[]} yearsToExclude - Years to restore
     * @param {string} bandsPrefix - Band prefix
     * @returns {ee.Image} Updated image
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
     * Restores specific classes from the original classification.
     * 
     * Prevents temporal filtering from modifying important classes.
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
  
  
    return this.init(param);

};


new TemporalFilter(param);