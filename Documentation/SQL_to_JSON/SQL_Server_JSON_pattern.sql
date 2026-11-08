/* Integration template for SQL Server 2019. No database objects are altered.
   Run AFTER loading the final, uniquely named output columns into #Result
   in the SAME session. #Result is an adapter staging table, not an SAP table.
   Its typed DDL must match the applicable schema and actual procedure metadata.
   Do not INSERT EXEC until duplicate output names have been removed and the
   exact result column order/types verified. No implicit period filtering occurs.
*/
DECLARE @FormType varchar(6) = '0619F'; -- 0619F / 1601FQ / 2306 / 2550M / 2550Q
IF @FormType NOT IN ('0619F','1601FQ','2306','2550M','2550Q')
    THROW 50000, 'Unsupported form type.', 1;
IF OBJECT_ID('tempdb..#Result') IS NULL
    THROW 50001, 'Populate #Result with the final SQL result first.', 1;

-- Use an explicit column list from SQL_to_JSON_mapping.csv in production.
-- Add an ORDER BY using a genuine unique source key if stable row order is needed.
SELECT @FormType AS [formType],
       JSON_QUERY((SELECT * FROM #Result FOR JSON PATH, INCLUDE_NULL_VALUES)) AS [details]
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;

/* Alternative: append FOR JSON PATH, INCLUDE_NULL_VALUES to each existing
   procedure's final SELECT, after ORDER BY (if present) and before DROP TABLE.
   That returns the details array; the application adds the formType envelope.
   Remove the duplicate docmonth projection in 0619F and 1601FQ first.
   Keep numeric SQL types numeric; do not FORMAT() money values into strings.
   Keep TIN, branch, and RDO as strings to preserve leading zeros.
*/
