/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet

 User Authentication
 */

var modules_used = [
  'N/ui/serverWidget',
  'N/runtime',
  'N/search',
  'N/record',
  'N/file',
  'N/crypto',
  'N/encode',
  'N/cache',
  'N/https',
  'N/render',
  'N/url',
  'N/config',
  'N/xml',
  './nexPos_integration_lib',
  './nexSale_config'
];

var SALT = "abcdefghijklmnopqstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ03456789";

define([
        'N/ui/serverWidget',
        'N/runtime',
        'N/search',
        'N/record',
        'N/file',
        'N/crypto',
        'N/encode',
        'N/cache',
        'N/https',
        'N/render',
        'N/url',
        'N/config',
        'N/xml',
        './nexPos_integration_lib',
        './nexSale_config'
      ],
  function(ui, runtime, search, record, file, crypto, encode, cache, https, render, url, configd, xml, lib, nexSale_config) {
    /**
    * Check email and password match within the employee record.
    *
    * @param email - Email
    * @param passw - Hashed password equivalent
    * @returns Object { result : Boolean, employee_id : Text, email : Text}
    *
    */
	function withMatch(email, passw) {
			var match = false;
			var emp_id = null;
      //Search Config
			var config = {
					type: record.Type.EMPLOYEE, 	//Employee Record
					filters: [{ 				    //Filters email and password
	  						name: 'email',
	  						operator: 'is',
	  						values: email
	  					},
	            {
	  						name: nexSale_config.field.ALT_PASSWORD,
	  						operator: 'is',
	  						values: passw
	  					}
	  				],
					columns: [{           //Internal Id
						  name: 'internalid'
	          }]
				};
      //Execute search
			var find = search.create(config);

      //Get matched employee Id
			find.run().each(function(result) {
					emp_id = result.getValue({
  						name: 'internalid'
  					});
					match = true;
			});

			return {
				result: match,
				employee_id: emp_id,
        email: email
			};
		}

	function getTaxCode(context, item_intid) {
		var item = search.lookupFields({
    		type: 'inventoryitem',
    		id: item_intid,
    		columns: ['taxschedule']
    	});
  
		var itemTaxSched = item['taxschedule'][0].value;

    	var res = https.get({
    		url: 'https://system.na2.netsuite.com/app/common/item/taxschedule.nl?id='+(itemTaxSched)+'&xml=T',
    		headers: context.request.headers
    	});
    	
    	log.debug({
    		title: 'TAX SCHED',
    		details: res.body
    	});

    	var xmlgen = xml.Parser.fromString({ text: res.body });

    	var sTaxNode = xml.XPath.select({
    		node : xmlgen,
    		xpath : '/nsResponse/record/machine/line/salestaxcode'
    	});
      
    	return {
    		tax_code: sTaxNode[0].textContent,
    		tax_sched: itemTaxSched
    	};
	}

    /**
    * This function gets the HMAC value of the string.
    *
    *  @param {string}
    *  			pasw - string
    *  @return {string}
    *      HMAC string
    */
    function doHash(pasw) {
      var hashed = null;

      var skey = crypto.createSecretKey({
        encoding: encode.Encoding.UTF_8,
        guid: nexSale_config.GUID
      });

      try {
        var hmacSha512 = crypto.createHmac({
          algorithm: 'SHA512',
          key: skey
        });
        hmacSha512.update({
          input: pasw,
          inputEncoding: encode.Encoding.BASE_64
        });

        hashed = hmacSha512.digest({
          outputEncoding: encode.Encoding.HEX
        });
      } catch (e) {
        log.error({
          title: 'doHash - Failed to hash input',
          details: 'key: '+skey+' '+e
        });
      }
      return hashed;
    }

    function genRandomString(salt, N) {
      return Array.apply(null, Array(N)).map(function() { return salt.charAt(Math.floor(Math.random() * salt.length)); }).join('');
    }

    /***
     * Checks if a Netsuite user
     * @params inputs -
     *
     */
    function checkNsAccess(inputs) {

      var head = 'NLAuth nlauth_account='+inputs.account+', ';
      var headerv = {'Authorization':  head+'nlauth_email='+inputs.email+', nlauth_signature='+inputs.password };


      var respond =  JSON.parse(https.get({
        url: inputs.url,
        headers: headerv
      }).body);

      //log.debug({title: 'CHECK NS', details: headerv});

      //If returns an array of access a NS user
      //return respond;
      if(respond['error'])
      {
    	  return false;
      }

      return true;
    }

    //Create a session on NS
    function createSession(cacheConfig, isKey, data, isTtl) {
      var session_cache = cache.getCache({
        name: cacheConfig.name,
        scope: cacheConfig.scope
      });

      //Session Cache Configuration
      var session_config = {
        key: isKey,
        value: {},
        ttl: isTtl
      };

      Object.keys(data).forEach(function(dataKey) {
        session_config['value'][dataKey] = data[dataKey];
      });

      session_cache.put(session_config);
    }

    //Builds the Authentication Form
    function setAuthForm(context) {
      var _this = this;
      this.context = context;
      //GET
      this.get = function() {
        var renderer = render.create();
        renderer.templateContent = file.load({
          id: nexSale_config.template.AUTH
        }).getContents();

        renderer.addCustomDataSource({
          format: render.DataSource.OBJECT,
        	alias: "data",
          data: nexSale_config
        });

        // respond back to the user
        this.context.response.write({
          output: renderer.renderAsString()
        });
      };

      //POST
      this.post = function() {
        var request = _this.context.request;
        var username = (request.parameters.username)?request.parameters.username:null;
        var passw = (request.parameters.passw)?request.parameters.passw:null;

        var result = {};
        var hashed = null;

        //Check if a Netsuite User
        if(checkNsAccess({
          email: username,
          password: passw,
          account: runtime.accountId,
          url: nexSale_config.ns_url_check
        })) {

          result.message = 'Welcome Netsuite User!';
          result.status = 1;

          hashed = genRandomString(SALT, 40);

          createSession({ //Cache Config
              name: nexSale_config.CACHE,
              scope: cache.Scope.PUBLIC
            }, hashed, //hashed
            {email: username}, // Details from the login
            18000 //TTL
          );

        //A Non Netsuite User
        } else {
          hashed = doHash(passw);
          if(hashed) // Hash was created
          {
            var isMatch = withMatch(username, hashed);

            if(!isMatch.result) // No Match Found
            {
              result.message = 'Invalid Credentials';
              result.status = 0;

            } else {

              //Set cache key by the matched hash and the value with the email and employee id
              var session_cache = cache.getCache({
                name: nexSale_config.CACHE,
                scope: cache.Scope.PUBLIC
              });

              session_cache.put({
                  key: hashed,
                  value: JSON.stringify({
                      email: isMatch.email,
                      employee_id: isMatch.employee_id
                  }),
                  ttl: 18000 // 30 minutes
                });

              result.message = 'Great! Welcome!';
              result.status = 1;
            }
          }
          else { //An Error Occurs with the hashing
            result.message = 'Error Occured!';
            result.status = -1;
          }
        }
        //Set the key of the session
        result.hashed = hashed;

        this.context.response.write(JSON.stringify(result));
      };

      return this;
    };

    //GUID Generator
    function setGuidForm(context) {

      this.get= function(){
        var form = ui.createForm({
  				title : 'GUID GENERATOR'
  			});

        //Field to generate GUID
        form.addSecretKeyField({
  				id : 'custpage_guid',
  				label : 'Credential',
  				restrictToScriptIds : nexSale_config.GUID_SCRIPTS,
  				restrictToCurrentUser : false
  			});

        form.addSubmitButton();
        context.response.writePage(form);
      };

      //RETURNS THE GUID
      this.post= function() {
        context.response.write(context.request.parameters.custpage_guid);
      };

      return this;
    }

    //Parses a cookie and mapped it into an object
    function cookieObject(cookie_s) {
      if(cookie_s && cookie_s.length) {
          var cookies = {};
          var c_temp = cookie_s.split(';');
          c_temp.forEach(function(v){
            var munch = v.split('=');
            cookies[munch[0].trim()] = munch[1];
          });
          return cookies;
      }
      return false;
    };

    //Checks the key against the NS Cache and returns the detail about the cache
    function checkCache(cache_key) {
      var nexCache = cache.getCache({
        name: nexSale_config.CACHE,
        scope: cache.Scope.PUBLIC
      });

      return nexCache.get({ key: cache_key });
    }

    //Checks the existense of cookies containing login information
    function checkAccess(context) {
      var cookie = cookieObject(context.request.headers.Cookie);

      if(cookie.identify) {
        if(checkCache(cookie.identify))
        {
          return true;
        }
      }
      return false;
    }

    //Transaction Form
    function transactForm(context) {

      var script = runtime.getCurrentScript();
      var bundleId = script.bundleIds;

      this.render = function() {
      // build the data for the page source object, specifically the linked files
        var PAGESOURCE = { // where the template page source content will come from
          files: {
            styles: {
              materialkit:  nexSale_config.template.PATH+'web/material-kit.css',
              source:       nexSale_config.template.PATH+'web/styles.css'
            },
            js: {
              materialmin:  nexSale_config.template.PATH+'web/material.min.js',
              knockback:    nexSale_config.template.PATH+'web/knockback-full-stack.min.js',
              materialkit:  nexSale_config.template.PATH+'web/material-kit.js',
              run:          nexSale_config.template.PATH+'run.js'
            }
          },
          connections:      JSON.stringify({
            algolia: {
              app:          'L5Q12X6VRS',
              key:          '8ef3e83c728074c432e96afcf234b50d',
              //index:        'nexPOS'
              index:        'test_VSJ'
            },
            firebase: {
              url:          ['https://nexpos-ac325.firebaseio.com', runtime.accountId].join('/')
            }
          }),
          templates:        JSON.stringify({
            'NO_DESCRIPTION': 'No Description Available',
            'FACETS':         nexSale_config.ALGOLIA.FACETS,
            //'FACETS':         ['brand', 'category', 'collection', 'stones'],
            'HITS_PER_PAGE':  100, // number of results shown per page
            'PAGINATION_SIZE': 100, //number of pages available within group
            'ITEM_URL':       url.resolveRecord({
              recordType:     record.Type.INVENTORY_ITEM
            })
          }),
          data:             JSON.stringify({
            customers:      [],
            pricelevels:    []
          }),
        };
        // convert the page source references to actual URL's
        [
          PAGESOURCE.files.styles, PAGESOURCE.files.js
        ].map(function(set) {
          Object.keys(set).map(function(f) {
            set[f] = file.load({ id: set[f] }).url;
          });
        });

        //create a renderer object, and use that to populate sections of the site based upon the htmlfile
        var renderer = render.create();
        var tpl = file.load({
          id: nexSale_config.template.PATH+'web/store.html'
        }).getContents().replace('{SO}', file.load({
          id: nexSale_config.template.PATH+'web/so.html'
        }).getContents());

        renderer.templateContent = tpl;
        renderer.addCustomDataSource({
          alias:    'data',
          format:   render.DataSource.OBJECT,
          data:     PAGESOURCE
        });
      // respond back to the user
        context.response.write({
          output: renderer.renderAsString()
        });
      }

      //GET
      this.get = function() {
        switch(context.request.parameters.action) {
          case 'getitems': {
            context.response.write({
              output: JSON.stringify(lib.CollectItemData(record.Type.INVENTORY_ITEM))
            })
            break;
          }
          case 'getcustomer':{
            var cust = lib.GetPriceLevelByCustomer(context.request.parameters.customerid);

            var cust_data = search.lookupFields({
              id: context.request.parameters.customerid,
              type: search.Type.CUSTOMER,
              columns: ['address', 'salesrep' ,'pricelevel']//, 'custentity_stoke_cust_location']
            });

            defaultAddress = cust_data['address'];
            log.debug('defaultAddress',defaultAddress);
            cust.billing_address=defaultAddress;
            cust.shipping_address=defaultAddress;
            cust.sales_rep = cust_data['salesrep'];
            cust.default_pricelevel = cust_data['pricelevel'];
            cust.location = [{"value":"1","text":"Main Warehouse"}];

            cust.grouppricing_pricelevel = {};

            var columnS = [
               { name: "entityid" },
               { name: "pricinggroup" },
               { name: "grouppricinglevel" }
            ];

            //Pricing group
            var find = search.create({
               type: "customer",
               filters: [
                  ["internalid","anyof", context.request.parameters.customerid]
               ],
               columns: columnS
            });


              find.run().each(function(result){
                var pricingGroupId = null;
                var pricingLevelId = null;

                if(result.getValue(columnS[1])) {

                  //Find Pricing Group based on Text
                  var findPricingGroup = search.create({
                     type: "pricinggroup",
                     filters: [
                        ["name","is", result.getValue(columnS[1])]
                     ],
                     columns: [
                        { name: "internalid"}
                     ]
                  });
                  findPricingGroup.run().each(function(result2) {
                    pricingGroupId = result2.getValue({ name: 'internalid'});
                     return true;
                  });

                  //Find Pricing Level based on Text
                  if(result.getValue(columnS[2])) {
                    var findPriceLevel = search.create({
                       type: "pricelevel",
                       filters: [
                          ["name","is", result.getValue(columnS[2])]
                       ],
                       columns: [
                          { name: "internalid"}
                       ]
                    }) ;
                    findPriceLevel.run().each(function(result3){
                      pricingLevelId = result3.getValue({ name: 'internalid'});
                       return true;
                    });
                  }

                  if(pricingGroupId) {
                    cust.grouppricing_pricelevel[pricingGroupId] = pricingLevelId;
                  }
                }
                 return true;
              });

            return context.response.write({
            	output: JSON.stringify(cust)
            })
           break;
           }
          case 'getentity':
            var customer_matched = [];
            var columnS = [{ name: 'internalid' }, { name: 'entityid' }];
            var filtersAre = [];

            if(context.request.parameters.keyword && context.request.parameters.keyword!= 'undefined') {
              filtersAre.push({ 				    //Filters email and password
                    name: 'entityid',
                    operator: 'HASKEYWORDS',
                    values: context.request.parameters.keyword
                  });
            }
            var config = {
      					type: search.Type.CUSTOMER, 	//Employee Record
      					columns: columnS
      				};
            if(filtersAre.length) {
              config.filters = filtersAre;
            }

            var find = search.create(config);
            var count = 0;
            find.run().each(function(result) {
              count+=1;
              customer_matched.push({
                'text': result.getValue(columnS[1]),
                'id': result.getValue(columnS[0])
              });
              return true;
            });

            return context.response.write({
                output: JSON.stringify({results: customer_matched})
              });
            break;
          case 'getclass':
              var class_matched = [];
              var columnS = [{ name: 'internalid' }, { name: 'name' }];
              var filtersAre = [];

              if(context.request.parameters.keyword && context.request.parameters.keyword!= 'undefined') {
                filtersAre.push(
                  ["name","contains", context.request.parameters.keyword]);
              }
              var config = {
                  type: 'classification', 	//Class
                  columns: columnS
                };
              if(filtersAre.length) {
                config.filters = filtersAre;
              }

              var find = search.create(config);
              find.run().each(function(result) {
                class_matched.push({
                  'text': result.getValue(columnS[1]),
                  'id': result.getValue(columnS[0])
                });
                return true;
              });

              return context.response.write({
                  output: JSON.stringify({results: class_matched})
                });
              break;
          case 'getlocation':
            var locs = [];
            var columnS = [{ name: 'internalid' }, { name: 'name' }];
            var filtersAre = [];

            if(context.request.parameters.keyword && context.request.parameters.keyword!= 'undefined') {
              filtersAre.push({ 				    //Filters email and password
                    name: 'name',
                    operator: 'CONTAINS',
                    values: context.request.parameters.keyword
                  });
            }
            var config = {
      					type: search.Type.LOCATION, 	//Employee Record
      					columns: columnS
      				};
            if(filtersAre.length) {
              config.filters = filtersAre;
            }

            var find = search.create(config);
            var count = 0;
            find.run().each(function(result) {
              count+=1;
              locs.push({
                'text': result.getValue(columnS[1]),
                'id': result.getValue(columnS[0])
              });
              return true;
            });

            return context.response.write({
              output: JSON.stringify({results: locs})
            });
            break;
          case 'getsrep': {
            var reps = [];
            var columnS = [{ name: 'internalid' }, { name: 'entityid' }];
            var filtersAre = [{
                  name: 'salesrep',
                  operator: 'is',
                  values: ['T']
                }];

            if(context.request.parameters.keyword && context.request.parameters.keyword!= 'undefined' ) {
              filtersAre.push(
                  {
                    name: 'entityid',
                    operator: 'HASKEYWORDS',
                    values: context.request.parameters.keyword
                  }
              );
            }
            var config = {
                type: search.Type.EMPLOYEE, 	//Employee Record
                columns: columnS
              };
            if(filtersAre.length) {
              config.filters = filtersAre;
            }

            var find = search.create(config);
            find.run().each(function(result) {
              reps.push({
                'text': result.getValue(columnS[1]),
                'id': result.getValue(columnS[0])
              });
              return true;
            });

            return context.response.write({
              output: JSON.stringify({results: reps})
            });
          } break;
          case 'getdept': {
            var reps = [];
            var columnS = [{ name: 'internalid' }, { name: 'name' }];
            var filtersAre = [];

            if(context.request.parameters.keyword && context.request.parameters.keyword!= 'undefined' ) {
              filtersAre.push(
                  {
                    name: 'name',
                    operator: 'CONTAINS',
                    values: context.request.parameters.keyword
                  }
              );
            }
            var config = {
                type: search.Type.DEPARTMENT, 	//Employee Record
                columns: columnS
              };
            if(filtersAre.length) {
              config.filters = filtersAre;
            }

            var find = search.create(config);
            find.run().each(function(result) {
              reps.push({
                'id': result.getValue(columnS[0]),
                'text': result.getValue(columnS[1])
              });
              return true;
            });

            return context.response.write({
              output: JSON.stringify({results: reps})
            });
          } break;
          case 'getitem': {
            var company_info = configd.load({
              type: configd.Type.COMPANY_INFORMATION
            });

            var settings_currency = company_info.getValue({ fieldId: 'basecurrency'});

            var _items = {};

            var columnS = [
              { name: "internalid" },
              { name: "itemid" },
              { name: "locationquantityavailable"},
              { name: "inventorylocation"},
              { name: "quantitycommitted"}, //COMMITTED
              { name: "quantitybackordered"}, //BACKORDERED
              { name: "pricelevel", join: "pricing" },
              { name: "unitprice", join: "pricing" },
              { name: "quantityrange", join: "pricing", sort: search.Sort.ASC },
              { name: "currency", join:"pricing" },
              { name: "class" },
              { name: "pricinggroup" },
              { name: "taxschedule" }
           ];

           var filtersAre = [
              ["type","anyof","InvtPart"],
              "AND",
              ["isinactive","is","F"],
              "AND",
              ["internalid","anyof", context.request.parameters.itemid],
              "AND",
              ["inventorylocation","anyof",context.request.parameters.location],
              "AND",
              ["pricing.minimumquantity","lessthanorequalto", context.request.parameters.itemqty],
              "AND",
              ["pricing.currency","anyof", settings_currency],
              "AND",
              ["type","anyof","InvtPart"]
           ];

           var config = {
             type: 'inventoryitem',
             filters: filtersAre,
             columns : columnS
           };

           var find = search.create(config);
           var count= 0;
           find.run().each(function(result) {
             count+=1;
             var id = result.getValue(columnS[0]);
             var priceLevel = result.getValue(columnS[6]);
            var priceLevelText = result.getText(columnS[6]);//priceLevel+'|'+result.getValue(columnS[8]);


            if(!_items[id]) {
               _items[id] = {
                 name: result.getValue(columnS[1]),
                 qty_available: parseFloatOrZero(result.getValue(columnS[2])),
                 committed: parseFloatOrZero(result.getValue(columnS[4])),
                 backordered: parseFloatOrZero(result.getValue(columnS[5])),
                 class: result.getValue(columnS[10]),
                 price_group: result.getValue(columnS[11]),
                // sales_tax_code: result.getValue(columnS[12]),
                 //sales_tax_rate: 0,
                 tax_sched: result.getValue(columnS[12]),
                 priceLevels: {}
               }
             }

            _items[id]['priceLevels'][priceLevel] = {
              text: priceLevelText,
              id: priceLevel,
              price: result.getValue(columnS[7])
            };
            log.debug('QTY Available',result.getValue({ name: "locationquantityavailable"}));
            
            var taxDtl = getTaxCode( context, id);

            var taxRate = search.create({
               type: "salestaxitem",
               filters: [
                  ["internalid","anyof", taxDtl['tax_code']]
               ],
               columns: ["rate"]
            });
            taxRate.run().each(function(result){
              log.debug('taxCode: '+result.getValue({name: 'rate'}));
              _items[id]['sales_tax_rate'] = parseFloatOrZero(result.getValue({name: 'rate'}))/100;
               return true;
            });

            return true;
           });

           return context.response.write({
               output: JSON.stringify(_items)
             });
            break;
          }
          case 'gettax': {
            var tax_codes = [];

            return context.response.write({
              output: JSON.stringify({results: tax_codes})
            });
          } break;
          default: return this.render(context);
          break;
        }
      };

      //POST
      this.post = function() {
        return context.response.write({
          output: JSON.stringify(lib.SubmitTransaction(context.request.parameters.transaction))
        });
      };

      return this;
    }

    function comesFromNS(context) {
      var user = runtime.getCurrentUser();
      log.debug({title: 'USER', details: user});
      if(user.roleId == 'online_form_user'){
        return false;
      }
      return true;
    }

    function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a}

		//onRequest
    function onRequest(context) {

      //GET
      if (context.request.method === https.Method.GET)
      {
        //return setGuidForm(context).get();
        //check
        if(comesFromNS(context)) {
          return transactForm(context).get();
        }

        if(!checkAccess(context)) {
          return setAuthForm(context).get();
        }
        return transactForm(context).get();
      }
      else { //POSTs
        //return setGuidForm(context).post();
        if(comesFromNS(context)) {
          return transactForm(context).post();
        }

        if(!checkAccess(context)) {
          return setAuthForm(context).post();
        }

        return transactForm(context).post();
      };
    }

    return {
        onRequest: onRequest
    };
  }
);
