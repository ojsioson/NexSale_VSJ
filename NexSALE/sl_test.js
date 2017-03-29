/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet

 Suitlet Testing
**/
define(['N/search', 'N/https', 'N/config', 'N/xml'],

function(search, https, config, xml) {
    function onRequest(context) {
    	var itemtax = search.lookupFields({
    		type: 'inventoryitem',
    		id: 3676,
    		columns: ['taxschedule']
    	});
    	
    	var res = https.get({
    		//url: 'https://system.na2.netsuite.com/app/common/item/taxschedule.nl?id=13&xml=T',
    		//headers: context.request.headers
    		url: 'https://www.w3schools.com/xml/books.xml'
    	});
    	
    	var xmlgen = xml.Parser.fromString({ text: res.body });
    	
    	
    	var sTaxNode = xml.XPath.select({
    		node : xmlgen,
    		xpath: '/bookstore/book/title'
    		//xpath : '/nsResponse/record/machine/line/salestaxcode'
    	});
    	
    	//var str = xml.Parser.toString({ document: xmlgen });
    	
    	context.response.write(JSON.stringify({"test":1 ,"sTaxNode" : sTaxNode }));
    }

    function parseFloatOrZero(a){a=parseFloat(a);return isNaN(a)?0:a};

    return {
        onRequest: onRequest
    };

});
