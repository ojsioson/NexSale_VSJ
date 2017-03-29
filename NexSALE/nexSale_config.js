/**
 * nexSale_config.js
 * @NApiVersion 2.0
 *
 */
define(['N/runtime'], function(runtime) {

  var script = runtime.getCurrentScript();
  var bundleId = script.bundleIds;


  return {
      // Fields on Netsuite
      field: {
          ALT_PASSWORD: 'custentity_alt_passw',
          ALGOLIA_ITEM: 'custitem_algolia_id'
      },
      // Session Cache Name on Netsuite
      CACHE: 'nexSaleCache',
      ns_url_check: 'https://rest.netsuite.com/rest/roles',
      //Generated GUID
      'GUID': '6D62EBD829B868B1CF09BF137583152F',
      // template use
      template: {
          AUTH: 'SuiteBundles/Bundle '+bundleId+'/NexSALE/web/user_auth.html',
          PATH: 'SuiteBundles/Bundle '+bundleId+'/NexSALE/',
      },
      //scripts for inclusion to GUID
			GUID_SCRIPTS: ['customscript_nexsale_ue_pass', 'customscript_nexsale_sl'],
			SL_EXTERN_URL: 'https://forms.na1.netsuite.com/app/site/hosting/scriptlet.nl?script=651&deploy=1&compid=TSTDRV1285764&h=1800dc85d916ec6abb0a',
      //Redirect url
      REDIR: 'https://system.na1.netsuite.com/app/site/hosting/scriptlet.nl?script=441&deploy=1',
      //Algolia credentials
      ALGOLIA: {
        APPLICATION_ID: 'L5Q12X6VRS',
        API_KEY: 'b7c55f8017be06bfd50d6bf5502bf07f',
        INDEX: 'test_VSJ',
        FACETS: ['Category', 'Sub Category']
      },
      //Search use for updating to Algolia & mapping of changes
      SEARCH_ID: 'customsearch_nexsale_item_search'
  };
});
