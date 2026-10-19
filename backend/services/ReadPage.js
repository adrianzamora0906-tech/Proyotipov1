const db = require('../config/database');
module.exports = async function readPage(sql, params, rawPage) {
  const page = /^\d{1,7}$/.test(String(rawPage)) ? Math.max(1,Number(rawPage)) : 1;
  const pageSize = 20;
  const result = await db.query(sql + ' LIMIT $' + (params.length+1) + ' OFFSET $' + (params.length+2), [...params,pageSize+1,(page-1)*pageSize]);
  return {items:result.rows.slice(0,pageSize),hasMore:result.rows.length>pageSize,page,pageSize};
};
