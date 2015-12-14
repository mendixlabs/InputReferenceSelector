/*jslint white:true, nomen: true, plusplus: true */
/*global mx,dojo,logger */

define([
    "dojo/_base/declare",
    "dojo/data/util/simpleFetch"
], function (declare, simpleFetch) {
    "use strict";

    var XPathSource = declare("refkit.lib.XPathSource", [], {
        limit       : 5,
        method      : "",
        xpath       : "",
        emptys      : true,
        atype       : "",
        order       : null,
        isEnum      : false,
        metaEntity  : null,

        constructor : function(kwArgs) {
            this.id = kwArgs.caller + '.XPathSource';
            this.entity = kwArgs.entity;
            this.limit  = kwArgs.limit;
            this.method = kwArgs.fetchmethod === "startswith" ? "starts-with" : kwArgs.fetchmethod;
            this.xpath  = "//" + this.entity + kwArgs.constraints;
            this.emptys = kwArgs.searchempty;
            this.order  = kwArgs.sortorder;

            var meta = mx.meta.getEntity(kwArgs.entity),
                type = meta.getAttributeType(kwArgs.attribute);

            this.atype = /AutoNumber|Integer|Long/.test(type) ? "integer" : type === "Decimal" ? "float" : "string";

            if(type === 'Enum') {
                this.isEnum = true;
                this.metaEntity = meta;
            }
        },

        updateConstraints : function(constraints) {
            this.xpath = "//" + this.entity + constraints;
        },

        _fetchItems : function(args, callback, error) {
            logger.debug(this.id + "._fetchItems");

            var xpath = this.getXPath(args.query);

            if (xpath) {
                mx.data.get({
                    xpath  : xpath,
                    filter : {
                        limit : this.limit,
                        sort  : this.order
                    },
                    callback : function(objs) {
                        callback(objs, args);
                    },
                    error : function() {
                        logger.debug(this.id + "._fetchItems.error");
                    }
                });
            } else {
                callback([], args);
            }
        },

        getXPath : function(query) {
            logger.debug(this.id + ".getXPath");

            var attr, value, type = this.atype;
            var constraint = '';
            for(var i in query) {
                attr  = i;

                value = query[i].replace(/\'/g, '&#39;');
                value = value.replace(/\"/g, '&#34;');

                //value = mx.parser.escapeQuotesInString(query[i]); // Function not available in 3.0 client

                if (type !== "string") {
                    if (isNaN(value)) {
                        return;
                    }

                    if (type === "integer") {
                        if (!/^[0-9]+$/.test(value)) { // isNaN("1.") == false
                            return;
                        }

                        value = parseInt(value);
                    }
                }

                break;
            }

            if (this.isEnum && this.metaEntity) {
                var values = this.mapEnumValues(value, attr);
                var constrArr = dojo.map(values, function(item, index) {
                    return attr + '= "' + item + '"';
                });

                constraint = '[' + constrArr.join(' or ') + ']';

                //for (var i = 0; i < values.length; i++) {
                //   constraint += i == 0 ? '['+ attr + '= "' + values[i] + '"' : ' or ' + attr + '= "' + values[i] + '"';
                //}
                //console.log(constraint);
            }

            if (value === "" && !this.emptys) {
                return;
            }

            if (constraint === '') {
                constraint = "[" + this.method + "(" + attr + ",'" + value + "')";
                if (this.method === "starts-with") {
                    constraint += " or " + attr + "='" + value + "'";
                }
                constraint += "]";
            }

            return this.xpath + constraint;
        },

        getValue : function(obj, attr) {
            logger.debug(this.id + ".getValue");
            var label;
            if(obj.isEnum(attr)){
                label = obj.getEnumCaption(attr);
            } else {
                label = obj.get(attr);
            }

            return label;
        },

        mapEnumValues : function(value, attr) {
            var captions = [];
            var map = this.metaEntity.getEnumMap(attr);

            for (var i = 0; i < map.length; i++) {
                var item = map[i];
                if (item.caption.indexOf(value) === 0) {
                    captions.push(item.key);
                }
            }
            return captions;
        }

    });

    dojo.extend(XPathSource, simpleFetch);

    return XPathSource;
});
