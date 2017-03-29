

// below is available globally so can access via console at runtime
var algolia = null,
    searchItems = null,
    itemsAvailabilityCollection = null,
    cartCollection = null,
    cartItem = null,
    categories = null;

/*
  The Firebase Data Model (for stock availability) and operation.
*/
var runFirebaseConnection = function() {
  // now play around with firebase modelling
  var itemAvailability = Backbone.Model.extend({
	  defaults: {
      qty: 0
    }
  });
  itemsAvailabilityCollection = new (Backbone.Firebase.Collection.extend({
    model: itemAvailability,
    url: CONNECTIONS.firebase.url
  }))();
  itemsAvailabilityCollection.on('sync', function(collection) {
    if (!searchItems.models.length) return; // nothing to do
    if (!collection.models.length) return; // same
    // if there are item models, update the availabily on the fly
    searchItems.models.map(function(item) {
      // search for the same id in the firebase collection
      collection.models.map(function(ita) {
        if (ita.id == item.get('id'))
          item.set('available', ita.get('qty'));
      });
    });
  });
};


/*
  The Backbone Data Models and operation.
*/
var runModelGeneration = function() {

  itemModel = Backbone.Model.extend({
    defaults: {
      id:           '',
      name:         '',
      displayname:  '',
      description:  '',
      url:          '',
      relevance:    0,
      available:    0,
      pricelevels:  [],
      defaultprice: 0,
      price:        0.00,
      //Added New Fields
      addQty: 1,
      pricingGroup: '',
      availablePerLocation: ''
    },
    initialize: function() {
      this.on('all', this.updatePrice, this)
    },
    updatePrice: function() {
     var id = this.get('id');
      var pricelevelMatch = _.find(NEXPOSDATA.pricelevels, function(p) {
        return p.itemid == id
      });

      if(NEXPOSDATA.default_pricelevel) {
        pricelevelMatch = {
          id: NEXPOSDATA.default_pricelevel,
          price: (function (pls) {
            var priceIs = _.find(pls, function(pl){
              return NEXPOSDATA.default_pricelevel == pl.id;
            });

            if(priceIs){
              return priceIs.price;
            }
          })(this.get('pricelevels'))
        }
        
        if(!pricelevelMatch.price){
        	pricelevelMatch = false;
        }
      }
      
      //console.log('pricelevelMatch: ',pricelevelMatch);

      // if not found, then return the default price
      if (!pricelevelMatch) return this.set('price', this.get('defaultprice'))
      // must have found a match
      if (pricelevelMatch.price) return this.set('price', pricelevelMatch.price)
      // must be a match on pricing level, find the price for the price level
      var byPriceLevel = _.find(this.get('pricelevels'), function(pl) {
        return pricelevelMatch.pricelevel == pl.id
      }) //safety, return default if none if found, shouldn't occur but you never know
      if (!byPriceLevel) return this.set('price', this.get('defaultprice'))
      return this.set('price', byPriceLevel.price) // return the price level of this item
    }
  })

  searchItems = new (Backbone.Collection.extend({
    model: itemModel
  }))()

  cartItem = Backbone.Model.extend({
    defaults: {
      id:           '',
      name:         '',
      displayname:  '',
      url:          '',
      pricelevels:  [],
      defaultprice: 0.00,
      price:        0.00,
      qty:          1,
      amount:       0.00,
      //ADDED FIELDS
      addQty: 0,
      priceLevels:   [],
      priceLevel: '',
      discount: '',
      rate: '',
      grossAmount: 0.0,
      availableOnHand: '',
      memoVal: '',
      taxAmount: '',
      taxCode: '',
      taxRate: 0,
      pricingGroup: null
    },
    initialize: function() {
      //this.on('all', this.updatePrice, this)
      //this.on('all', this.updateAmount, this)
    },
    updatePrice: function() {},
    updateAmount: function() { // updates the price based upon changes to qty, and discount price levels.
      this.set('amount', (this.get('qty') * this.get('price')))
    }
  });

  var CartCollection = Backbone.Collection.extend({
    model: cartItem
  })
  cartCollection = new CartCollection()

  var runAlgoliaSearch = function(term, event) {

    // from the selected options, lets' generate the search object
    var facetFilters = [], page = 0
    Object.keys(this.categorySelection).map(function(category) {
      if (this.categorySelection[category])
        facetFilters.push([category, this.categorySelection[category]].join(':'))
    }.bind(this))
    var customRanking = undefined
    if (this.sortBy() != 'relevance') {
      if (this.sortBy() == 'pricehighest') customRanking = ["desc(defaultprice)"]
      if (this.sortBy() == 'pricelowest') customRanking = ["asc(defaultprice)"]
    }
    switch(event) {
      case 'termchange':
        break;
      case 'facetselection':
        break;
      case 'pageselection':
        page = this.selectedPage()
        break;
    }

    algolia.search(term, {
      getRankingInfo:   true,
      page:             page,
      hitsPerPage:      TEMPLATES.HITS_PER_PAGE,
      facets:           TEMPLATES.FACETS, //filters we're interested in receiving
      facetFilters:     facetFilters.length ? facetFilters : undefined
    }, function(err, results) {

      //console.log('result',results) // logs the results from algolia

      if (err) return console.error('Problem with Search')

      // update how long this took and how many results we have
      this.numResults(results.nbHits)
      this.runTime(results.processingTimeMS)

      // build pagination array
      this.pages([])
      this.searchPages(results.nbPages)
      this.selectedPage(page+1)
      if (results.nbPages+1 > 1) {
        this.pages.push({
          index:    1,
          visible:  true,
          active:   this.selectedPage() == 1
        })
        if (this.selectedPage() > TEMPLATES.PAGINATION_SIZE)
          this.pages.push({
            index:    '...',
            action:   '-',
            visible:  true,
            active:   false
          })
        // calculate which options we should see based upon the current selection
        var minimumPage = this.selectedPage() - (this.selectedPage() % TEMPLATES.PAGINATION_SIZE),
            maximumPage = minimumPage + TEMPLATES.PAGINATION_SIZE
        _.range(2, results.nbPages).map(function(pageindex) {
          this.pages.push({
            index:    pageindex,
            visible:  (pageindex >= minimumPage && pageindex <= maximumPage),
            active:   this.selectedPage() == pageindex
          })
        }.bind(this))
        if ((this.selectedPage() + TEMPLATES.PAGINATION_SIZE) < results.nbPages)
          this.pages.push({
            index:    '...',
            action:   '+',
            visible:  true,
            active:   false
          })
        this.pages.push({
          index:    results.nbPages,
          visible:  true,
          active:   this.selectedPage() == (results.nbPages)
        });
      }

      // set the categories using the facet results
      this.categories([]) //reset the categories
      var ordering = {};
      Object.keys(TEMPLATES.FACETS).forEach(function(v,i,a){
        var index = TEMPLATES.FACETS[v];
        ordering[index]=results.facets[index];
      });

      Object.keys(ordering).map(function(facet) {
        this.categories.push({
          id:       facet,
          options:  (function(opts) {
            return Object.keys(opts).map(function(key) {
              return {
                id: key, value: opts[key],
                selected: ko.observable(this.categorySelection[facet] == key)
              }
            }.bind(this))
          }.bind(this))(ordering[facet])
        });

      }.bind(this));


      // clear the searchItems collection before populating
      searchItems.reset();
      // now populate the backbone model with the new data

      var __self = this;
      results.hits.map(function(hit) {
        var parseLevels = hit["Price Level"];
        var pricelevels = [];
        if(parseLevels){
        	Object.keys(parseLevels).forEach(function(v, i, a){
                pricelevels.push(v);
              });
        }
        
        //console.log('hit', hit);
        
        searchItems.add(new itemModel({
          id:           hit['Internal ID'],
          name:         hit['Name'],
          display:      true,
          displayname:  hit['Display Name'],
          defaultprice: hit['Base Price'],
          availablePerLocation: (function(inv_loc){
            if(inv_loc && inv_loc.length) {
              return JSON.parse(inv_loc);
            }
            return null;
          })(hit["Inventory Location"]),
          pricelevels:  pricelevels,
          url:          hit["Store Display Image"],//hit.url,
          description:  hit["Store Description"] || TEMPLATES.NO_DESCRIPTION,
          //relevance:    hit._rankingInfo.userScore,
          price: hit['Base Price'], //temp
          pricingGroup: hit['Pricing Group'],
          available:    //(hit["Qty Available"])?hit["Qty Available"]:-1
            (function(inv_loc){
              if(inv_loc && inv_loc.length) {
                var checkAvailable = JSON.parse(inv_loc);
                var locationIs = __self.soLocation();
                if(locationIs) {
                  if(checkAvailable[locationIs]) {
                    return (Math.round(checkAvailable[locationIs]['qty']) <1 )?-1:Math.round(checkAvailable[locationIs]['qty']);
                  }
                } else {
                  return (hit["Available"])?Math.round(hit["Available"]):-1;
                }
              }
              return -1;
            })(hit["Inventory Location"])
        }));
      });

    }.bind(this));
  };

  /*
    The Knockout ViewModel for drawing the page.
  */
  var searchViewModel = function() {
    // view specific fields
    this.numResults = ko.observable(0);
    this.runTime = ko.observable(0);
    this.searchTerm = ko.observable('');
    this.searchPages = ko.observable(0);
    this.selectedPage = ko.observable(0);
    this.pages = ko.observableArray([]);
    this.sortOptions = ko.observableArray([]);
    this.sortBy = ko.observable('relevance');
    

    this.sortResults = function() {
      runAlgoliaSearch.bind(this)(this.searchTerm(), 'termchange')
    }.bind(this)
    this.gotoPage = function(index, action) {
      if (action == '+') this.selectedPage(this.selectedPage()-1 + TEMPLATES.PAGINATION_SIZE)
      else if (action == '-') this.selectedPage(this.selectedPage()-1 - TEMPLATES.PAGINATION_SIZE)
      else this.selectedPage(index-1)
      runAlgoliaSearch.bind(this)(this.searchTerm(), 'pageselection')
    }.bind(this)
    // catch the onchange event, and fire off a search to algolia
    this.searchTerm.subscribe(function() {
      runAlgoliaSearch.bind(this)(this.searchTerm(), 'facetselection');
    }.bind(this))

    // customer list
    this.customers = ko.observableArray(NEXPOSDATA.customers)
    this.customerid = ko.observable('');

    //Added SO details

    this.soDate = ko.observable(moment(new Date()).format('M/D/YYYY'));
    this.soDeliverDate = ko.observable();
    this.soPickDate = ko.observable();
    this.soPoRef = ko.observable();
    this.soMemo = ko.observable();
    this.soLocation = ko.observable();
    this.soSRep = ko.observable();
    this.soSalesRep = ko.observable();
    this.soOfficeNotes = ko.observable();
    this.soDeliveryNotes = ko.observable();
    this.soSalesRepList = ko.observableArray([]);
    this.soShippingAddress = ko.observable();
    this.soBillingAddress = ko.observable();
    this.soLoc = ko.observable();
    this.soLocationList = ko.observableArray([]);
    
  


    this.taxCodes = [];

    this.subTotal = ko.observable(0);
    this.taxTotal = ko.observable(0);

    this.salesRepChange = function() {
      this.soSalesRep(this.soSRep());
    };
    var ROOT = this;

    //location binding

    this.locationChange = function(){
      this.soLocation(this.soLoc());
    };

    this.soLocation.subscribe(function(value) {
      runAlgoliaSearch.bind(this)(this.searchTerm(), 'termchange');
    }.bind(this));

    this.itemAfterRender = function(el){
      var self = this;

      var select_config = { width: '90%' };

      if(!ROOT.taxCodes.length) {
        select_config['ajax'] = {
          url: function (params) {
            return window.location.origin+window.location.pathname
              +window.location.search+'&action=gettax&customerid='+ROOT.customerid();
          },
          dataType: 'json',
          processResults: function (data) {
            ROOT.taxCodes = data.results;
            return data;
          }
        };
      } else {
        select_config['data'] = ROOT.taxCodes;
      }

      //$(el).find('.itemTaxCode').select2(select_config);
    };

    //Gross change on blur
    this.grossChanged = function(item) {
      if(item['model']) {
          item = item.model();
      }

      var computedTax = parseFloatOrZero(item.get('taxRate'));
      var computedAmt = parseFloatOrZero(item.get('grossAmount'));

      computedTax = computedAmt*computedTax;

      item.set('amount', (computedAmt+computedTax).toFixed(2));
      item.set('taxAmount', (computedTax).toFixed(2));
      ROOT.UpdateCartAmounts();
    };

    this.recomputeLine = function(item){
      if(item['model']){
        item = item.model();
      }
      var currPriceLevel = item.get('priceLevel');


      ROOT.itemQuery(item.get('id'), item.get('qty'), function(result) {
        var priceLevels = _.map(result[item.get('id')]['priceLevels'], function(ea){ return { name: ea.text, value: ea.id, rate: ea.price } });

        var pricing = ROOT.refreshPriceLevel(item, result, priceLevels);
        item.set('priceLevels', pricing.pricelevels);

        var priceIs = _.find(item.get('priceLevels'), function(pricing){ return pricing.value == item.get('priceLevel')});

        if(priceIs) {
          if(priceIs.name!='Custom'){
            item.set('rate', priceIs.rate);
          }
        }

        var computedAmt = item.get('qty') * item.get('rate');
        var computedTax = 0;
        var computedGross = 0;

        computedTax = computedAmt*item.get('taxRate');
        item.set('grossAmount', (computedAmt).toFixed(2));
        item.set('taxAmount', (computedTax).toFixed(2));
        item.set('amount', (computedAmt+computedTax).toFixed(2));
        ROOT.UpdateCartAmounts();
      });
    };

    this.priceLevelChange = function(item){
      var priceIs = _.find(item.priceLevels(), function(pricing){ if(pricing.value == item.priceLevel()){ return pricing; }});
      var target = arguments[arguments.length-1].target;
      if(priceIs) {
        if(priceIs.name != 'Custom') {
          item.rate(priceIs.rate);
          $(target).parents('tr').find('.itemRate').attr('disabled', 'disabled');
        } else {
          item.rate('');
          $(target).parents('tr').find('.itemRate').removeAttr('disabled');
        }
        item.model().set('amount', priceIs.rate);
        ROOT.recomputeLine(item);
      }
    };

    this.customerChange = function() {
      var self = this;
      // get from ns what the price levels are for this customer
      jQuery.ajax({
        dataType: 'json', method: 'GET', url: [
          document.location.href,
          'action=getcustomer',
          'customerid='+this.customerid()
        ].join('&')
      }).done(function(result) {
        // have the result, apply the changes
    	  
        NEXPOSDATA.pricelevels = JSON.parse(JSON.stringify(result.pricing)) //ensure pure copy
        NEXPOSDATA.default_pricelevel = (result.default_pricelevel.length)?result.default_pricelevel[0]['value']:null;
        NEXPOSDATA.grouppricing_pricelevel = result.grouppricing_pricelevel;

        this.searchItems().map(function(item) {
          //item.price(0) // trigger the pricing change event (on search items collection)
        }.bind(this))
        this.cartItems().map(function(item) {
           // trigger the pricing change event (on cart collection)
          var PL = 1;
          var pricelevelMatch = null;

          //ITEM PRICING
          var id = item.id;
          pricelevelMatch = _.find(NEXPOSDATA.pricelevels, function(p) {
            return p.itemid == id
          });
          
          console.log('pricelevel', item.priceLevels());

          //DEFAULT PRICE LEVEL
          if(!pricelevelMatch) {
            if(NEXPOSDATA.default_pricelevel) {
              pricelevelMatch = {
                'value': (function (pls) {
                    var level = _.find(pls, function(pl) {
                      return NEXPOSDATA.default_pricelevel == pl.value;
                    });

                    if(level){
                      return level.value;
                    }
                })(item.priceLevels())
              };
            }
          }

          if(pricelevelMatch && pricelevelMatch.value) {
            PL = pricelevelMatch['value'];
          }
          item.model().set('priceLevel', PL);
        }.bind(this))
        UpdateCartAmounts()
        $.notify({ // tell the user we're applied some pricing changes
          icon: 'fa fa-usd',
        	message: ['Customer pricing levels for', result.name, 'applied'].join(' ')
        }, {
        	type: 'success',
          delay: 2000,
          placement: {
            fromt: 'top', align: 'left'
          }
        });
        // notify the user that we've applied the pricing
        this.soShippingAddress(result.shipping_address);
        this.soBillingAddress(result.billing_address);
        if(result.sales_rep) {
          this.soSalesRepList(result.sales_rep);
          if(result.sales_rep[0]) {
        	  this.soSRep(result.sales_rep[0]['value']);
              this.soSalesRep(result.sales_rep[0]['value']);
          }
        }
        if(result.location) {
          this.soLocationList(result.location);
          this.soLoc(result.location[0]['value']);
          this.soLocation(result.location[0]['value']);
        }
        this.soDate = ko.observable(moment(new Date()).format('M/D/YYYY'));
        this.soPostDate = ko.observable(moment(new Date()).format('M/D/YYYY'));

      }.bind(this)).error(function(err) {
        console.error(err)
        return alert('There was a problem collecting this customers information, see console log.')
      })
    }

    // items from search
    this.searchItems = kb.collectionObservable(searchItems, {
      view_model: kb.ViewModel
    })

    // convenience method to open up item in netsuite
    this.openIteminNetsuite = function(itemid) {
      return TEMPLATES.ITEM_URL+'&id='+itemid//+itemid.split('_')[1]].join('&')
    }

    // fire off new search based upon category selection
    this.categoryChange = function(catid, optionid) {

      var cat = _.find(this.categories(), function(cat) {
        return cat.id == catid
      })
      var option = _.find(cat.options, function(option) {
        return option.id == optionid
      })
      if (option.selected())
        this.categorySelection[catid] = optionid
      else this.categorySelection[catid] = null

      runAlgoliaSearch.bind(this)(this.searchTerm(), 'facetselection')
    }.bind(this)
    // categories (populated from search)
    // note: no need for a backbone model, as it's view level only
    this.categories = ko.observableArray([])
    // category selection ownership
    this.categorySelection = {}
    TEMPLATES.FACETS.map(function(facet) {
      this.categorySelection[facet] = null
    }.bind(this))


    // the cart
    this.cartItems = kb.collectionObservable(cartCollection, {
      view_model: kb.ViewModel
    })
    this.cartTotal = ko.observable(0)
    this.cartItemsAmount = ko.observable('')
    this.totalQty = ko.observable(0)

    UpdateCartAmounts = function() {
      var __cartTotal = 0;
      var __subTotal = 0;
      var __cartItemsAmount = 0;
      var __taxTotal = 0;
      var totalQty = 0
      __cartItemsAmount = this.cartItems().length;

      if(this.cartItems().length) {
        this.cartItems().forEach(function(ea){
            __cartTotal+=parseFloatOrZero(ea.amount());
            __subTotal+=parseFloatOrZero(ea.grossAmount());
            totalQty+=parseFloatOrZero(ea.qty());
            __taxTotal+=parseFloatOrZero(ea.taxAmount());
        });
      }
      this.cartTotal(numeral(__cartTotal, 0.0).format('$0,0.00'));
      this.subTotal(numeral(__subTotal, 0.0).format('$0,0.00'));
      this.taxTotal(numeral(__taxTotal, 0.0).format('$0,0.00'));
      this.totalQty(totalQty);
      this.cartItemsAmount(__cartItemsAmount);
    }.bind(this)

    this.UpdateCartAmounts = UpdateCartAmounts;

    SELF = this;

    //itemQuery
    //args 1. itemid, 2. item qty, 3. success callback with arguments
    this.itemQuery = function(args){
      var ARGS = arguments;
      jQuery.ajax({
        dataType: 'json', method: 'GET', url: [
          document.location.href,
          'action=getitem',
          'itemid='+arguments[0],
          'location='+SELF.soLocation(),
          'itemqty='+parseFloatOrZero(arguments[1])
        ].join('&')
      }).done(function(result) {
        if(_.isFunction(ARGS[2])){
            ARGS[2](result);
        }
      }.bind()).error(function(err) {
        if(arguments[3]) {
          console.error(err)
          return alert('There was a problem adding the item to the cart, see console log.')
        }
      });
    };

    this.refreshPriceLevel = function(itemHandle, result, __priceLevels) {
      var __pricelevel = '1';
      if(itemHandle['model']){
        itemHandle = itemHandle['model']();
      }

      var itemPricing = _.find(NEXPOSDATA.pricelevels, function(v){ return (v.itemid == itemHandle.get('id')) });
      if(!itemPricing){
        __priceLevels.push({name:'Custom', value: '-1', rate: ''});
        var itemPriceGroup = result[itemHandle.get('id')]['price_group'];
        if(NEXPOSDATA['grouppricing_pricelevel'][itemPriceGroup]) { // Group prcing match
          __pricelevel = itemPriceGroup;
        } else { //No Group pricing, Check Cust pricing level set
          if(NEXPOSDATA['default_pricelevel']) {
            __pricelevel = NEXPOSDATA['default_pricelevel'];
          }
        }
      } else {
        __priceLevels.push({name:'Custom', value: '-1', rate: itemPricing.price.toString()});
        __pricelevel = '-1';
      }

      return {
        pricelevel: __pricelevel,
        pricelevels: __priceLevels
      };
    };

    this.mandatoryFields = [
      //{'soLocation': 'Location'},
      {'customerid': 'Customer'},
      {'soDate': 'Date'},
      //{'soSalesRep': 'Sales Representative'}
    ];

    this.checkMandatoryFields = function(){
      var returnIs = true;
      this.mandatoryFields.forEach(function(v, i, a){
        var fieldKey = Object.keys(v)[0];
        if(!ROOT[fieldKey]()){
          returnIs = false;
          $.notify({
              icon: 'fa fa-usd',
              message: 'There is no '+v[fieldKey]+' set yet.'
            }, {
              type: 'warning',
              delay: 3000,
              placement: {
                fromt: 'top', align: 'left'
              }
            });
        }
      });

      return returnIs;
    }

    this.taxSched = {};
    
    // add an item to the cart
    this.addItem = function(item, qty) {
      // check if there is already an item in there of the same type, if so add to quantity
      var existing = _.find(cartCollection.models, function(cartitem) {
        return cartitem.id == item.id()
      }) // if not found, then add to collection

      var addQty = 1;
      if(qty){ addQty = parseFloatOrZero(qty); }

      if(!(SELF.checkMandatoryFields())){
        return false;
      }

      SELF.itemQuery(item.id(), parseFloatOrZero(addQty),
        function(result) {
            if (!existing) {
              var priceLevels = _.map(result[item.id()]['priceLevels'], function(ea){ return { name: ea.text, value: ea.id, rate: ea.price } });

              if(parseFloatOrZero(result[item.id()]['qty_available']) <= 0) {
                //alert('There is no available quantity on hand and will be then backordered.');

              $.notify({
                  icon: 'fa fa-usd',
                  message: ['There is no available quantity for ', '<strong>'+item.name()+'</strong>', ' and will be backordered.'].join(' ')
                }, {
                  type: 'danger',
                  delay: 2000,
                  placement: {
                    fromt: 'top', align: 'left'
                  }
                });
              }
              console.log('Add to cart', result);
              
                  var pricing = SELF.refreshPriceLevel(item, result, priceLevels);

                  var amt = item.price();
                  var taxRateIs = result[item.id()]['sales_tax_rate'];
                  var taxdAmt = amt*taxRateIs;
                  var itemEntry = { // add to the cart collection
                    id:             item.id(),
                    name:           item.name(),
                    displayname:    item.displayname(),
                    defaultprice:   item.defaultprice(),
                    url:            item.url(),
                    'pricelevels':    JSON.parse(JSON.stringify(item.pricelevels())),
                    priceLevel:   (pricing.pricelevel)?pricing.pricelevel:'1',
                    priceLevels:  pricing.pricelevels,
                    availableOnHand: result[item.id()]['qty_available'],
                    commitment:  result[item.id()]['committed'],
                    backOrdered: result[item.id()]['backordered'],
                    qty:            addQty,
                    taxRate: taxRateIs,
                    taxAmount: taxdAmt,
                    amount:         amt,
                    class:         result[item.id()]['class'],
                    pricingGroup: result[item.id()]['price_group']
                  };

                  var rateIs = _.find(priceLevels, function(level){ if(level.value == itemEntry['priceLevel']) { return level; }});

                  itemEntry.rate = (rateIs && rateIs['rate'])?rateIs['rate']:0;

                  var newCartItem = new cartItem(itemEntry);
                  cartCollection.add(newCartItem);
                  SELF.recomputeLine(cartCollection.get(newCartItem.cid));

                  $.notify({ // tell the user we're adding a new item
                    icon: 'fa fa-shopping-cart',
                    message: ['You added a new item:', item.displayname()].join(' ')
                  }, {
                    type: 'info',
                    delay: 2000,
                    placement: {
                      fromt: 'top', align: 'left'
                    }
                  });
            	  
             // });
            } else {
              existing.set('qty', existing.get('qty')+addQty) }// then add to quantity
            $('.input-qty').val(1).change();
        }
      );
    }
  
    // the buttons for adding or subtracting the qty of items
    this.qtyChange = function(item, type) {
      // find the backbone model we need to change
      var qty = parseFloatOrZero(item.qty());
      if (type == 'up') {
        item.model().set('qty', qty+1)
      } else {
        item.model().set('qty', qty-1)
        if (item.model().get('qty') == 0) //remove this model, can't order 0
          cartCollection.remove(item.model())
      }

      SELF.recomputeLine(item);
      UpdateCartAmounts()
    }
    // for removing an item in whole
    this.removeItem = function(item) {
      cartCollection.remove(item.model())
      UpdateCartAmounts()
    }
    this.resetCart = function() {
      cartCollection.reset()
    }

    // actually submitting the transaction
    this.submitCart = function() {
      if (!this.customerid())
        return alert('No Customer Identified!')

      //this.mandatoryFields.push({'soPickDate': 'Pick Date'});

      if(!this.checkMandatoryFields()){
    	  return false;
      }

      var transactionCart = {
        entity:   this.customerid(),
        items:    cartCollection.toJSON().map(function(item) {
          return _.omit(item, ['pricelevels', 'url'])
        })};

      //Additional SO Fields
      mapSoFields = {
        'trandate': this.soDate(),
        'otherrefnum': this.soPoRef(),
        //'custbody_delivery_date': this.soPickDate(),
        //'custbodydelivery_dt': this.soDeliverDate(),
        'location': this.soLocation(),
        'memo': this.soMemo(),
        'salesrep': this.soSalesRep(),
        'billaddress': this.soBillingAddress(),
        'shipaddress': this.soShippingAddress(),
     
        //'custbodyoffice_notes': this.soOfficeNotes(),
        //'custbodydelivery_notes': this.soDeliveryNotes()
      };

      jQuery.ajax({
        url:          document.location.href,
        method:       'POST',
        dataType:     'json',
        data: {
          transaction: JSON.stringify({
            entity:   this.customerid(),
            otherFields: mapSoFields,
             items:    cartCollection.toJSON().map(function(item) {
              return _.omit(item, ['pricelevels', 'url'])
            })
          })
        }
      }).done(function(result) {
        console.log(result) // tell the console we have some data
        cartCollection.reset() // clear the cart ready to start again
        ROOT.UpdateCartAmounts();

        $.notify({ // tell the user we're applied some pricing changes
          icon: 'fa fa-usd',
          message: ['Sales Order Created!'].join(' ')
        }, {
          type: 'success',
          delay: 2000,
          placement: {
            fromt: 'top', align: 'left'
          }
        });
        window.open(result.url, '_blank');
        setTimeout(function(){ window.location.reload(); }, 2000);
        return ;
      }.bind(this)).error(function(err) {
        console.error(err)
        return alert('There was a problem collecting submitting this order, see console log.')
      })
    }.bind(this)



    // run the search upon load, to populate the page
    runAlgoliaSearch.bind(this)('', 'termchange')
  }

  model = new searchViewModel();
  // apply all of the bindings
  ko.applyBindings(model)

}

function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a}

$(function() {

  var algolia_client = algoliasearch(CONNECTIONS.algolia.app, CONNECTIONS.algolia.key);
  // connect to algolia for search, setup the multiple indexes used for sorting
  algolia = algolia_client.initIndex(CONNECTIONS.algolia.index)

  // generate the models in use
  //runFirebaseConnection()
  runModelGeneration()

  // adding a knockout custom binding to handle 'currency' output, relies on 'numeral'
  ko.bindingHandlers.money = {
    update: function(element, valueAccessor, allBindings) {
      var $el = $(element),
          valueUnWrapped = ko.unwrap(valueAccessor()),
          method;
      if ($el.is(':input')) method = 'val'
      else method = 'text'
      return $el[method](numeral(valueUnWrapped).format('$0,0.00'))
    }
  }

  // set focus on search when page loads
  $("#searchterm").focus();

  $.expr[":"].contains = $.expr.createPseudo(function(arg) {
      return function( elem ) {
          return $(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
      };
  });

  //Category Filtering
  ko.bindingHandlers.applyCategoryFilter = {
    update: function(el, valueAccessor, allBindings) {
      var checkboxes = null;
      var $el = $(el);
      var root = arguments;

      var filter = function() {
        var categoryContainer = $($(this).parents('.categories_container')[0]);
        categoryContainer.find('.checkbox').hide();
        if(this.value.length == 0) {
          categoryContainer.find('.checkbox').show()//css('background-color', 'pink');
        }
        //if(this.value.length > 3) {
          //categoryContainer.find('.checkbox').hide();
          var matches = categoryContainer.find('span:contains('+this.value+')');

          if(matches && matches.length) {
            $.each(matches, function(k, el1) {
              $(el1).parents('div.checkbox').show()//css('background-color', 'yellow');
            });
          }
        //}
      }

      $el.on('keyup keypress', filter);
    }
  };

  function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a}

  //Item Activities
  ko.bindingHandlers.itemActions = {
    update: function(el, valueAccessor, allBindings) {
      var $el = $(el);
      var root = arguments;

      $($el.find('.addIt')).click(function(){
        var qty = 1;

        var input = $el.find('.input-qty');
        if(input) {
          input = input[0];
          qty = parseFloatOrZero($(input).val());
          qty+=1;
          $(input).val(qty).change();
        }
      });
      $($el.find('.deductIt')).click(function(){
        var qty = 1;

        var input = $el.find('.input-qty');
        if(input) {
          input = input[0];
          qty = parseFloatOrZero($(input).val());
          if(qty <= 1) {
            qty = 1;
          } else {
            qty-=1;
          }
          $(input).val(qty).change();
        }
      });
    }
  };


  $('.datepicker').datepicker( "option", "dateFormat", 'dd/mm/yy' );

  var full_url = window.location.origin+window.location.pathname;

  //SELECT2
  $(".select2_customer").select2({
    width: '100%',
    ajax: {
      url: function (params) {
        return full_url+window.location.search+'&action=getentity&keyword='+params.term;
      },
      dataType: 'json'
    }
  });

  $(".select2_location").select2({
    ajax: {
      url: function (params) {
        return full_url+window.location.search+'&action=getlocation&keyword='+params.term;
      },
      data: function (params) {
        return {
          q: params.term, // search term
          page: params.page
        };
      },
      dataType: 'json'
    }
  });

  $(".select2_srep").select2({
    ajax: {
      url: function (params) {
        return full_url+window.location.search+'&action=getsrep&keyword='+params.term;
      },
      data: function (params) {
        return {
          q: params.term, // search term
          page: params.page
        };
      },
      success: function(data) {
            return data;
      },
      dataType: 'json'
    }
  });

  $.fn.modal.Constructor.prototype.enforceFocus = function() {};

  //LIST/GRID VIEW
  $('#list').click(function(event){event.preventDefault();$('#search-results .item').addClass('list-group-item');});
  $('#grid').click(function(event){event.preventDefault();$('#search-results .item').removeClass('list-group-item');$('search-results .item').addClass('grid-group-item');});
});
