begin;

-- Generated from the normalized staging workbook by scripts/build-july-2026-import.ps1.
-- This immutable import follows the repository's established historical-import pattern.

alter table public.daily_sales_summaries
  add column if not exists total_sales_lovin_raw numeric(18,2),
  add column if not exists product_quantity_recorded numeric(14,3),
  add column if not exists product_detail_available boolean not null default true,
  add column if not exists source_notes text;

comment on column public.daily_sales_summaries.total_sales_lovin_raw is
  'Raw Lovin value as entered by the source; may be NULL when a resolved value is derivable.';
comment on column public.daily_sales_summaries.product_detail_available is
  'Whether dated product-quantity detail is present in the aggregate source.';

create temporary table july_menu(category_name text, product_name text, price numeric) on commit drop;
insert into july_menu values
('Milks Series','Chocolate Milk',15000),
('Milks Series','Strawberry Milk',15000),
('Milks Series','Original Milk',15000),
('Milks Series','Bubble Gum Milk',15000),
('Milks Series','Vanilla Milk',15000),
('Milks Series','Matcha Milk',15000),
('Milks Series','Date Milk',15000),
('Milks Series','Chocolate Ice Cream Float',19000),
('Milks Series','Strawberry Ice Cream Float',19000),
('Milks Series','Bubble Gum Ice Cream Float',19000),
('Milks Series','Chocolate Jelly Delight',19000),
('Milks Series','Strawberry Jelly Delight',19000),
('Milks Series','Bubble Gum Jelly Delight',19000),
('Milkshake Series','Chocolate Milkshake',21000),
('Milkshake Series','Strawberry Milkshake',21000),
('Milkshake Series','Vanilla Milkshake',21000),
('Milky Drink','Triple Scoop Ice Cream',19000),
('Milky Drink','Es Teler',19000),
('Kids Meal Package','Katsu Nori Rice Kids Meal',22000),
('Kids Meal Package','Butter Rice Ball with Popcorn Chicken',22000),
('Kids Meal Package','Fried Noodle Kids Meal',21000),
('Snack Series','Cheese Mix Platter',17000),
('Snack Series','Crispy Fried Banana',17000),
('Snack Series','Grilled Banana with Chocolate',16000),
('Snack Series','Lovin'' Burger',21000),
('Snack Series','Crispy French Fries',17000),
('Snack Series','Dimsum',19000),
('Snack Series','Crispy Fried Otak-Otak',17000),
('Snack Series','Fried Nugget',19000),
('Main Course Series','Special Fried Rice',24000),
('Main Course Series','Smashed Chicken with Geprek Sambal',26000),
('Main Course Series','Crispy Katsu with Sambal Matah',26000),
('Noodle and Pasta','Creamy Spaghetti Carbonara',26000),
('Noodle and Pasta','Signature Stir-Fried Noodles',22000),
('Noodle and Pasta','Savory Meatballs',19000),
('Ice Tea and Coffee','Zesty Lemon Tea',12000),
('Ice Tea and Coffee','Lychee Iced Tea',12000),
('Ice Tea and Coffee','Ice Tea',7000),
('Warmth Series','Classic Hot Coffee',7000),
('Warmth Series','Hot Chocolate',15000),
('Warmth Series','Lemongrass Ginger Tea',15000),
('Complementary Series','Mineral Water',5000),
('Complementary Series','Rice',5000);

create temporary table july_sales(
  sale_date date, bill_count integer, adult_visitors integer, child_visitors integer,
  visitor_total integer, total_sales numeric, arayya_sales numeric,
  lovin_raw numeric, lovin_resolved numeric, product_qty numeric,
  product_detail_available boolean, source_notes text
) on commit drop;
insert into july_sales values
('2026-07-01'::date,8,12,10,22,742000,247000,495000,495000,32,true,null),
('2026-07-02'::date,14,17,15,32,1158000,176000,982000,982000,56,true,null),
('2026-07-03'::date,14,14,12,26,789000,57000,732000,732000,35,true,null),
('2026-07-04'::date,18,18,11,29,1048000,37000,1011000,1011000,63,true,null),
('2026-07-05'::date,22,21,29,50,2446000,485000,1961000,1961000,107,true,null),
('2026-07-06'::date,12,14,16,30,844000,121000,723000,723000,43,true,null),
('2026-07-07'::date,5,6,9,15,844000,null,844000,844000,29,true,null),
('2026-07-08'::date,4,17,9,26,1879000,null,1879000,1879000,51,true,null),
('2026-07-09'::date,null,6,5,11,274000,null,274000,274000,16,true,'Jumlah Struk Transaksi kosong meski Total Sales Rp274.000; jangan dianggap 0.'),
('2026-07-10'::date,19,16,14,30,1103000,19000,1084000,1084000,56,true,null),
('2026-07-11'::date,17,18,10,28,1278000,53000,1225000,1225000,55,true,null),
('2026-07-12'::date,16,15,8,23,1188000,58000,1130000,1130000,63,true,null),
('2026-07-13'::date,17,13,8,21,277000,58000,219000,219000,44,true,null),
('2026-07-14'::date,9,8,6,14,634000,null,634000,634000,33,true,null),
('2026-07-15'::date,2,4,3,7,140000,0,140000,140000,8,true,null),
('2026-07-16'::date,4,7,4,11,445000,null,445000,445000,26,true,null),
('2026-07-17'::date,8,14,3,17,452000,0,452000,452000,23,true,null),
('2026-07-18'::date,17,22,23,45,1035000,34000,1001000,1001000,61,true,null),
('2026-07-19'::date,17,13,7,20,1324000,54000,null,1270000,70,true,'Total Sales Lovin kosong pada sumber; nilai resolved = Total Sales - Total Sales Arayya.'),
('2026-07-20'::date,5,4,2,6,151000,34000,117000,117000,8,true,null),
('2026-07-21'::date,8,8,6,14,377000,19000,358000,358000,23,true,null),
('2026-07-22'::date,2,2,1,3,124000,null,124000,124000,7,true,null),
('2026-07-23'::date,0,null,null,null,0,0,0,0,0,false,null),
('2026-07-24'::date,6,8,6,14,513000,121000,392000,392000,19,true,null),
('2026-07-25'::date,15,7,12,19,863000,68000,795000,795000,47,true,null),
('2026-07-26'::date,26,18,23,41,1497000,63000,1434000,1434000,83,true,null),
('2026-07-27'::date,13,11,10,21,557000,53000,504000,504000,30,true,null),
('2026-07-28'::date,8,10,4,14,436000,null,436000,436000,23,true,null),
('2026-07-29'::date,4,4,3,7,186000,0,186000,186000,11,true,null),
('2026-07-30'::date,8,8,4,12,537159,136000,401159,401159,0,false,'Sumber mencatat Total Sales Rp537.159 (termasuk komponen Rp159); dipertahankan apa adanya.'),
('2026-07-31'::date,null,null,null,null,0,null,0,0,0,false,'Baris 31 Juli kosong/0 pada sumber.');

create temporary table july_mapping(
  raw_name text, final_name text, category_name text, mapping_status text, is_free boolean
) on commit drop;
insert into july_mapping values
('Crispy Katsu Sambal Matah','Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('Smashed Chiken With Geprek Sambal','Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('Spesial fried Rice','Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('Signature Stir-Fried Noodles','Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('Savory meatballs','Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('Warm And Savory Noodle Bowl',null,null,'UNMATCHED_HISTORICAL',false),
('Rice','Rice','Complementary Series','MATCH_EXACT',false),
('Creamy Spageti Carbonara','Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('Katsu Nori Rice Kids Meal','Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('Fried Noodle Kids Meal','Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('Fried Rice Kids Meal',null,null,'UNMATCHED_HISTORICAL',false),
('Butter Rice Ball With Popcorn Chiken','Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('Lovin Burger','Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('Grilled Banana With Chocolate','Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('Crispy French Fries','Crispy French Fries','Snack Series','MATCH_EXACT',false),
('Nugget','Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('Cheese Mix Platter','Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('Crispy Fried Banana','Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('Dimsum','Dimsum','Snack Series','MATCH_EXACT',false),
('Crispy Fried Otak-Otak','Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('Free-Menu French Fries','Crispy French Fries','Snack Series','FREE_ALIAS',true),
('Chocolate Milk','Chocolate Milk','Milks Series','MATCH_EXACT',false),
('Strawberry Milk','Strawberry Milk','Milks Series','MATCH_EXACT',false),
('Banana Milk',null,null,'UNMATCHED_HISTORICAL',false),
('Bubble Gum Milk','Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('Matcha Milk','Matcha Milk','Milks Series','MATCH_EXACT',false),
('Original Milk','Original Milk','Milks Series','MATCH_EXACT',false),
('Date Milk','Date Milk','Milks Series','MATCH_EXACT',false),
('Vanilla Milk','Vanilla Milk','Milks Series','MATCH_EXACT',false),
('Chocolate Milksake','Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('Srawberry Milksake','Strawberry Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('Vanilla Milksake','Vanilla Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('Chocolate Cereal Milk',null,null,'UNMATCHED_HISTORICAL',false),
('Ice Tea','Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('Lemon Tea','Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('Leci tea','Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('Tripple Scop Ice Cream','Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('Clasik Hot Coffe','Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('Hot Chocolate','Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('Lemongrass Ginger tea','Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('Es Teler','Es Teler','Milky Drink','MATCH_EXACT',false),
('Mineral Water','Mineral Water','Complementary Series','MATCH_EXACT',false),
('Free-Menu Original Milk','Original Milk','Milks Series','FREE_ALIAS',true),
('Bubble ice cream float','Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('Chocolate ice cream float','Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('strawberry ice cream float','Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('Buble gum jelly delight','Bubble Gum Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('Strawberry jelly delight','Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('chocolate jelly delight','Chocolate Jelly Delight','Milks Series','MATCH_NORMALIZED',false);

create temporary table july_quantities(
  sale_date date, raw_name text, quantity numeric, final_name text,
  category_name text, mapping_status text, is_free boolean
) on commit drop;
insert into july_quantities values
('2026-07-01'::date,'Butter Rice Ball With Popcorn Chiken',3,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-01'::date,'Chocolate Milk',2,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-01'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Crispy French Fries',1,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-01'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-01'::date,'Crispy Fried Otak-Otak',2,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-01'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-01'::date,'Fried Noodle Kids Meal',1,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-01'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-01'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Lemongrass Ginger tea',1,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Matcha Milk',2,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-01'::date,'Mineral Water',3,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-01'::date,'Savory meatballs',2,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-01'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-01'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Butter Rice Ball With Popcorn Chiken',5,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-02'::date,'Chocolate Milk',3,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-02'::date,'Creamy Spageti Carbonara',2,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Crispy French Fries',3,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-02'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-02'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-02'::date,'Crispy Katsu Sambal Matah',3,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-02'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-02'::date,'Free-Menu French Fries',2,'Crispy French Fries','Snack Series','FREE_ALIAS',true),
('2026-07-02'::date,'Fried Noodle Kids Meal',1,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-02'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Katsu Nori Rice Kids Meal',2,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-02'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Lemongrass Ginger tea',3,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Lovin Burger',1,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Matcha Milk',3,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-02'::date,'Mineral Water',5,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-02'::date,'Savory meatballs',3,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Signature Stir-Fried Noodles',5,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-02'::date,'Smashed Chiken With Geprek Sambal',1,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-02'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-03'::date,'Butter Rice Ball With Popcorn Chiken',2,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-03'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Crispy French Fries',5,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-03'::date,'Crispy Fried Banana',3,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-03'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-03'::date,'Ice Tea',2,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-03'::date,'Katsu Nori Rice Kids Meal',2,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-03'::date,'Lemongrass Ginger tea',2,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-03'::date,'Rice',1,'Rice','Complementary Series','MATCH_EXACT',false),
('2026-07-03'::date,'Savory meatballs',3,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Signature Stir-Fried Noodles',2,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-03'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-03'::date,'Strawberry jelly delight',1,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-03'::date,'Vanilla Milk',1,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-04'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-04'::date,'Chocolate ice cream float',2,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Clasik Hot Coffe',2,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Crispy French Fries',8,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-04'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-04'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-04'::date,'Es Teler',7,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-04'::date,'Grilled Banana With Chocolate',4,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-04'::date,'Katsu Nori Rice Kids Meal',5,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-04'::date,'Leci tea',3,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Lemongrass Ginger tea',2,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Matcha Milk',3,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-04'::date,'Mineral Water',4,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-04'::date,'Original Milk',2,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-04'::date,'Smashed Chiken With Geprek Sambal',2,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-04'::date,'Strawberry jelly delight',1,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-04'::date,'Vanilla Milk',2,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-04'::date,'strawberry ice cream float',2,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Butter Rice Ball With Popcorn Chiken',4,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-05'::date,'Chocolate Milk',9,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-05'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Chocolate ice cream float',3,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Clasik Hot Coffe',2,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Creamy Spageti Carbonara',4,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Crispy French Fries',5,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-05'::date,'Crispy Fried Banana',3,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-05'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-05'::date,'Crispy Katsu Sambal Matah',7,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-05'::date,'Dimsum',3,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-05'::date,'Es Teler',8,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-05'::date,'Free-Menu French Fries',1,'Crispy French Fries','Snack Series','FREE_ALIAS',true),
('2026-07-05'::date,'Fried Noodle Kids Meal',1,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-05'::date,'Hot Chocolate',1,'Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('2026-07-05'::date,'Ice Tea',4,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-05'::date,'Katsu Nori Rice Kids Meal',3,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-05'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Lovin Burger',5,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Matcha Milk',5,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-05'::date,'Mineral Water',11,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-05'::date,'Rice',2,'Rice','Complementary Series','MATCH_EXACT',false),
('2026-07-05'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Signature Stir-Fried Noodles',3,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-05'::date,'Smashed Chiken With Geprek Sambal',3,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Spesial fried Rice',4,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-05'::date,'Strawberry Milk',3,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-05'::date,'Tripple Scop Ice Cream',5,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-05'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-06'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Creamy Spageti Carbonara',2,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Crispy French Fries',5,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-06'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-06'::date,'Crispy Fried Otak-Otak',4,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-06'::date,'Dimsum',3,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-06'::date,'Es Teler',3,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-06'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Ice Tea',2,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-06'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-06'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Lemongrass Ginger tea',2,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-06'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-06'::date,'Original Milk',3,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-06'::date,'Rice',2,'Rice','Complementary Series','MATCH_EXACT',false),
('2026-07-06'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-06'::date,'Strawberry jelly delight',1,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'Vanilla Milk',1,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-06'::date,'chocolate jelly delight',1,'Chocolate Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-06'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-07'::date,'Butter Rice Ball With Popcorn Chiken',4,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-07'::date,'Chocolate Milksake',2,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Crispy French Fries',2,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-07'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-07'::date,'Es Teler',3,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-07'::date,'Free-Menu Original Milk',3,'Original Milk','Milks Series','FREE_ALIAS',true),
('2026-07-07'::date,'Katsu Nori Rice Kids Meal',2,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-07'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Lovin Burger',2,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-07'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-07'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-07'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-08'::date,'Butter Rice Ball With Popcorn Chiken',2,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-08'::date,'Chocolate ice cream float',2,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Clasik Hot Coffe',2,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Crispy French Fries',4,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-08'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-08'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-08'::date,'Es Teler',4,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-08'::date,'Free-Menu Original Milk',4,'Original Milk','Milks Series','FREE_ALIAS',true),
('2026-07-08'::date,'Fried Noodle Kids Meal',1,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-08'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-08'::date,'Katsu Nori Rice Kids Meal',3,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-08'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Lovin Burger',2,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-08'::date,'Original Milk',2,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-08'::date,'Signature Stir-Fried Noodles',2,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-08'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-08'::date,'Strawberry jelly delight',1,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-08'::date,'Vanilla Milk',1,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-08'::date,'Vanilla Milksake',1,'Vanilla Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-08'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-09'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-09'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-09'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-09'::date,'Crispy French Fries',1,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-09'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-09'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-09'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-09'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-09'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-09'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-09'::date,'Tripple Scop Ice Cream',4,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-10'::date,'Butter Rice Ball With Popcorn Chiken',2,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Cheese Mix Platter',7,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-10'::date,'Chocolate Milksake',4,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Clasik Hot Coffe',2,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Crispy Fried Banana',3,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-10'::date,'Crispy Fried Otak-Otak',2,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-10'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-10'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-10'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-10'::date,'Fried Noodle Kids Meal',4,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-10'::date,'Hot Chocolate',1,'Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('2026-07-10'::date,'Ice Tea',6,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-10'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Lemongrass Ginger tea',1,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Mineral Water',5,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-10'::date,'Rice',2,'Rice','Complementary Series','MATCH_EXACT',false),
('2026-07-10'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Srawberry Milksake',1,'Strawberry Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Strawberry jelly delight',2,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-10'::date,'Tripple Scop Ice Cream',3,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Butter Rice Ball With Popcorn Chiken',4,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Chocolate Milk',3,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-11'::date,'Chocolate ice cream float',4,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Clasik Hot Coffe',1,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Crispy French Fries',5,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-11'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-11'::date,'Crispy Katsu Sambal Matah',4,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-11'::date,'Es Teler',5,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-11'::date,'Hot Chocolate',1,'Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('2026-07-11'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-11'::date,'Katsu Nori Rice Kids Meal',3,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-11'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Lemongrass Ginger tea',1,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Lovin Burger',2,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-11'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-11'::date,'Nugget',1,'Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Original Milk',2,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-11'::date,'Rice',1,'Rice','Complementary Series','MATCH_EXACT',false),
('2026-07-11'::date,'Savory meatballs',2,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Smashed Chiken With Geprek Sambal',5,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-11'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-11'::date,'Warm And Savory Noodle Bowl',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-11'::date,'strawberry ice cream float',2,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Butter Rice Ball With Popcorn Chiken',5,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Cheese Mix Platter',3,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-12'::date,'Chocolate Milksake',4,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Clasik Hot Coffe',1,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Crispy French Fries',6,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-12'::date,'Crispy Fried Banana',4,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-12'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-12'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-12'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-12'::date,'Es Teler',3,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-12'::date,'Fried Rice Kids Meal',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-12'::date,'Ice Tea',4,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-12'::date,'Leci tea',4,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Lemon Tea',2,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Lemongrass Ginger tea',2,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Matcha Milk',2,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-12'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-12'::date,'Original Milk',2,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-12'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-12'::date,'Signature Stir-Fried Noodles',3,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-12'::date,'Tripple Scop Ice Cream',8,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-13'::date,'Butter Rice Ball With Popcorn Chiken',1,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-13'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-13'::date,'Chocolate Cereal Milk',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-13'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-13'::date,'Crispy French Fries',4,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-13'::date,'Crispy Fried Banana',3,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-13'::date,'Crispy Fried Otak-Otak',3,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-13'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-13'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-13'::date,'Katsu Nori Rice Kids Meal',4,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-13'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-13'::date,'Matcha Milk',2,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'Mineral Water',6,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-13'::date,'Original Milk',3,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-13'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'Vanilla Milk',2,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-13'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Butter Rice Ball With Popcorn Chiken',1,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Cheese Mix Platter',4,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-14'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Clasik Hot Coffe',1,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Crispy French Fries',2,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-14'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-14'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-14'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-14'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-14'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-14'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-14'::date,'Nugget',3,'Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-14'::date,'Tripple Scop Ice Cream',2,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-14'::date,'chocolate jelly delight',2,'Chocolate Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-14'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-15'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-15'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-15'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-15'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-15'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-15'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-15'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Chocolate Milk',3,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-16'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Crispy French Fries',4,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-16'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-16'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-16'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-16'::date,'Es Teler',4,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-16'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-16'::date,'Lovin Burger',1,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-16'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-16'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-16'::date,'Vanilla Milksake',1,'Vanilla Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-16'::date,'strawberry ice cream float',2,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Banana Milk',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-17'::date,'Buble gum jelly delight',1,'Bubble Gum Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-17'::date,'Dimsum',3,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-17'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-17'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-17'::date,'Katsu Nori Rice Kids Meal',3,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-17'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-17'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-17'::date,'Smashed Chiken With Geprek Sambal',2,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-17'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-17'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Butter Rice Ball With Popcorn Chiken',3,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-18'::date,'Chocolate Milk',3,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Chocolate Milksake',3,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Chocolate ice cream float',2,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Crispy French Fries',2,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-18'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-18'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-18'::date,'Crispy Katsu Sambal Matah',4,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-18'::date,'Es Teler',3,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-18'::date,'Fried Noodle Kids Meal',2,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-18'::date,'Grilled Banana With Chocolate',2,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-18'::date,'Katsu Nori Rice Kids Meal',3,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-18'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Lemon Tea',2,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Lovin Burger',3,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Matcha Milk',3,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Mineral Water',3,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-18'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-18'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-18'::date,'Strawberry jelly delight',2,'Strawberry Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Tripple Scop Ice Cream',2,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-18'::date,'Warm And Savory Noodle Bowl',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-18'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-19'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Buble gum jelly delight',1,'Bubble Gum Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Butter Rice Ball With Popcorn Chiken',3,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-19'::date,'Chocolate Milk',3,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-19'::date,'Chocolate Milksake',1,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Chocolate ice cream float',3,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Clasik Hot Coffe',1,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Creamy Spageti Carbonara',2,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Crispy French Fries',7,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-19'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-19'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-19'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-19'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-19'::date,'Es Teler',7,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-19'::date,'Fried Noodle Kids Meal',2,'Fried Noodle Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-19'::date,'Grilled Banana With Chocolate',2,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Ice Tea',8,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-19'::date,'Katsu Nori Rice Kids Meal',4,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-19'::date,'Lemon Tea',2,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-19'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-19'::date,'Signature Stir-Fried Noodles',3,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-19'::date,'Smashed Chiken With Geprek Sambal',5,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Srawberry Milksake',1,'Strawberry Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-19'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-20'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-20'::date,'Es Teler',1,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-20'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-20'::date,'Lovin Burger',1,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-20'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-20'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-20'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-21'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Crispy French Fries',1,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-21'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-21'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-21'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-21'::date,'Es Teler',1,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-21'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-21'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-21'::date,'Leci tea',2,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-21'::date,'Mineral Water',4,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-21'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-21'::date,'Smashed Chiken With Geprek Sambal',1,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Srawberry Milksake',1,'Strawberry Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-21'::date,'Tripple Scop Ice Cream',1,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-21'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-22'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-22'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-22'::date,'Ice Tea',2,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-22'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-22'::date,'Lemongrass Ginger tea',1,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-22'::date,'Smashed Chiken With Geprek Sambal',1,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-24'::date,'Crispy French Fries',1,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-24'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-24'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-24'::date,'Ice Tea',4,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-24'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-24'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-24'::date,'Nugget',3,'Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('2026-07-24'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-24'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-24'::date,'Tripple Scop Ice Cream',2,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-24'::date,'Warm And Savory Noodle Bowl',1,null,null,'UNMATCHED_HISTORICAL',false),
('2026-07-25'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-25'::date,'Butter Rice Ball With Popcorn Chiken',1,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-25'::date,'Chocolate Milksake',2,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Crispy French Fries',2,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-25'::date,'Crispy Fried Banana',3,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-25'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-25'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Dimsum',3,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-25'::date,'Es Teler',2,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-25'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Ice Tea',4,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-25'::date,'Katsu Nori Rice Kids Meal',4,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-25'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Lemon Tea',1,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Lovin Burger',1,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-25'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-25'::date,'Original Milk',4,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-25'::date,'Savory meatballs',3,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-25'::date,'Strawberry Milk',2,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-25'::date,'Tripple Scop Ice Cream',2,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-25'::date,'strawberry ice cream float',2,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Bubble Gum Milk',1,'Bubble Gum Milk','Milks Series','MATCH_EXACT',false),
('2026-07-26'::date,'Bubble ice cream float',1,'Bubble Gum Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Buble gum jelly delight',1,'Bubble Gum Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Butter Rice Ball With Popcorn Chiken',1,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Cheese Mix Platter',1,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-26'::date,'Chocolate Milk',2,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-26'::date,'Chocolate Milksake',2,'Chocolate Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Chocolate ice cream float',3,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Clasik Hot Coffe',1,'Classic Hot Coffee','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Creamy Spageti Carbonara',1,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Crispy French Fries',6,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-26'::date,'Crispy Fried Banana',5,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-26'::date,'Crispy Fried Otak-Otak',4,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-26'::date,'Crispy Katsu Sambal Matah',4,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Date Milk',1,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-26'::date,'Es Teler',3,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-26'::date,'Grilled Banana With Chocolate',3,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Hot Chocolate',3,'Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('2026-07-26'::date,'Ice Tea',6,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-26'::date,'Katsu Nori Rice Kids Meal',6,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-26'::date,'Leci tea',1,'Lychee Iced Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Lemon Tea',3,'Zesty Lemon Tea','Ice Tea and Coffee','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Lovin Burger',1,'Lovin'' Burger','Snack Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Matcha Milk',3,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-26'::date,'Mineral Water',5,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-26'::date,'Nugget',1,'Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-26'::date,'Smashed Chiken With Geprek Sambal',3,'Smashed Chicken with Geprek Sambal','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Spesial fried Rice',2,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Tripple Scop Ice Cream',3,'Triple Scoop Ice Cream','Milky Drink','MATCH_NORMALIZED',false),
('2026-07-26'::date,'Vanilla Milksake',2,'Vanilla Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'chocolate jelly delight',1,'Chocolate Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-26'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-27'::date,'Cheese Mix Platter',2,'Cheese Mix Platter','Snack Series','MATCH_EXACT',false),
('2026-07-27'::date,'Chocolate Milk',2,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-27'::date,'Creamy Spageti Carbonara',3,'Creamy Spaghetti Carbonara','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-27'::date,'Crispy French Fries',2,'Crispy French Fries','Snack Series','MATCH_EXACT',false),
('2026-07-27'::date,'Crispy Fried Banana',2,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-27'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-27'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-27'::date,'Date Milk',2,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-27'::date,'Dimsum',2,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-27'::date,'Ice Tea',3,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-27'::date,'Katsu Nori Rice Kids Meal',1,'Katsu Nori Rice Kids Meal','Kids Meal Package','MATCH_EXACT',false),
('2026-07-27'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-27'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-27'::date,'Signature Stir-Fried Noodles',1,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-27'::date,'Srawberry Milksake',1,'Strawberry Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-27'::date,'Vanilla Milksake',1,'Vanilla Milkshake','Milkshake Series','MATCH_NORMALIZED',false),
('2026-07-27'::date,'strawberry ice cream float',2,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Butter Rice Ball With Popcorn Chiken',2,'Butter Rice Ball with Popcorn Chicken','Kids Meal Package','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Chocolate ice cream float',1,'Chocolate Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Crispy Fried Banana',1,'Crispy Fried Banana','Snack Series','MATCH_EXACT',false),
('2026-07-28'::date,'Crispy Fried Otak-Otak',1,'Crispy Fried Otak-Otak','Snack Series','MATCH_EXACT',false),
('2026-07-28'::date,'Crispy Katsu Sambal Matah',2,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Dimsum',1,'Dimsum','Snack Series','MATCH_EXACT',false),
('2026-07-28'::date,'Es Teler',1,'Es Teler','Milky Drink','MATCH_EXACT',false),
('2026-07-28'::date,'Grilled Banana With Chocolate',1,'Grilled Banana with Chocolate','Snack Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Hot Chocolate',2,'Hot Chocolate','Warmth Series','MATCH_EXACT',false),
('2026-07-28'::date,'Ice Tea',1,'Ice Tea','Ice Tea and Coffee','MATCH_EXACT',false),
('2026-07-28'::date,'Lemongrass Ginger tea',1,'Lemongrass Ginger Tea','Warmth Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'Mineral Water',2,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-28'::date,'Signature Stir-Fried Noodles',3,'Signature Stir-Fried Noodles','Noodle and Pasta','MATCH_EXACT',false),
('2026-07-28'::date,'Strawberry Milk',1,'Strawberry Milk','Milks Series','MATCH_EXACT',false),
('2026-07-28'::date,'Vanilla Milk',1,'Vanilla Milk','Milks Series','MATCH_EXACT',false),
('2026-07-28'::date,'chocolate jelly delight',1,'Chocolate Jelly Delight','Milks Series','MATCH_NORMALIZED',false),
('2026-07-28'::date,'strawberry ice cream float',1,'Strawberry Ice Cream Float','Milks Series','MATCH_NORMALIZED',false),
('2026-07-29'::date,'Chocolate Milk',1,'Chocolate Milk','Milks Series','MATCH_EXACT',false),
('2026-07-29'::date,'Crispy Katsu Sambal Matah',1,'Crispy Katsu with Sambal Matah','Main Course Series','MATCH_NORMALIZED',false),
('2026-07-29'::date,'Date Milk',3,'Date Milk','Milks Series','MATCH_EXACT',false),
('2026-07-29'::date,'Matcha Milk',1,'Matcha Milk','Milks Series','MATCH_EXACT',false),
('2026-07-29'::date,'Mineral Water',1,'Mineral Water','Complementary Series','MATCH_EXACT',false),
('2026-07-29'::date,'Nugget',1,'Fried Nugget','Snack Series','MATCH_NORMALIZED',false),
('2026-07-29'::date,'Original Milk',1,'Original Milk','Milks Series','MATCH_EXACT',false),
('2026-07-29'::date,'Savory meatballs',1,'Savory Meatballs','Noodle and Pasta','MATCH_NORMALIZED',false),
('2026-07-29'::date,'Spesial fried Rice',1,'Special Fried Rice','Main Course Series','MATCH_NORMALIZED',false);

do $$
declare
  v_outlet_id uuid;
  v_lovin_id uuid;
  v_arayya_id uuid;
  v_actor_id uuid;
begin
  select id into strict v_outlet_id from public.outlets
  where lower(btrim(name)) = 'kadirojo' and is_active and deleted_at is null;
  select id into strict v_lovin_id from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'lovin milk' and deleted_at is null;
  select id into strict v_arayya_id from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'arayya' and deleted_at is null;
  select id into strict v_actor_id from public.profiles
  where role = 'super_admin' and is_active order by created_at limit 1;

  if (select count(*) from july_menu) <> 43
     or (select count(distinct category_name) from july_menu) <> 10 then
    raise exception 'Final Lovin menu manifest is not 43 products / 10 categories.';
  end if;
  if (select coalesce(sum(total_sales),0) from july_sales) <> 23141159
     or (select coalesce(sum(arayya_sales),0) from july_sales) <> 1893000
     or (select coalesce(sum(lovin_raw),0) from july_sales) <> 19978159
     or (select coalesce(sum(lovin_resolved),0) from july_sales) <> 21248159
     or (select coalesce(sum(quantity),0) from july_quantities) <> 1122 then
    raise exception 'July staging totals do not match the locked source manifest.';
  end if;

  update public.business_subunits set inventory_enabled = false, updated_at = clock_timestamp()
  where id = v_lovin_id;
  update public.business_subunits set inventory_enabled = true, updated_at = clock_timestamp()
  where id = v_arayya_id;
  update public.outlet_reporting_configs
  set operational_reporting_start_date = date '2026-08-01', updated_at = clock_timestamp()
  where outlet_id = v_outlet_id;

  insert into public.sales_categories(name, description, subunit_id, is_active)
  select distinct category_name, 'Menu resmi Lovin Milk 2026', v_lovin_id, true
  from july_menu
  on conflict (subunit_id, lower(name)) do update
  set name = excluded.name, description = excluded.description,
      is_active = true, updated_at = clock_timestamp();

  update public.sales_categories c set is_active = false, updated_at = clock_timestamp()
  where c.subunit_id = v_lovin_id
    and not exists (select 1 from july_menu m where lower(m.category_name) = lower(c.name));

  update public.products p
  set name = m.product_name, selling_price = m.price, unit = 'pcs',
      sku = 'LM-' || upper(substr(md5(m.product_name),1,10)),
      sales_category_id = c.id, is_active = true, deleted_at = null, deleted_by = null,
      notes = 'Menu resmi Lovin Milk 2026', updated_at = clock_timestamp()
  from july_menu m
  join public.sales_categories c on c.subunit_id = v_lovin_id
    and lower(c.name) = lower(m.category_name)
  where p.id = (
    select p2.id from public.products p2
    join public.sales_categories c2 on c2.id = p2.sales_category_id
    where c2.subunit_id = v_lovin_id and lower(p2.name) = lower(m.product_name)
    order by p2.deleted_at nulls first, p2.created_at limit 1
  );

  insert into public.products(name, sku, unit, selling_price, sales_category_id, is_active, notes)
  select m.product_name, 'LM-' || upper(substr(md5(m.product_name),1,10)), 'pcs',
    m.price, c.id, true, 'Menu resmi Lovin Milk 2026'
  from july_menu m
  join public.sales_categories c on c.subunit_id = v_lovin_id
    and lower(c.name) = lower(m.category_name)
  where not exists (
    select 1 from public.products p join public.sales_categories pc on pc.id=p.sales_category_id
    where pc.subunit_id=v_lovin_id and lower(p.name)=lower(m.product_name)
  );

  update public.products p
  set is_active=false, deleted_at=coalesce(deleted_at,clock_timestamp()),
      deleted_by=coalesce(deleted_by,v_actor_id), updated_by=v_actor_id,
      updated_at=clock_timestamp()
  from public.sales_categories c
  where c.id=p.sales_category_id and c.subunit_id=v_lovin_id
    and not exists(select 1 from july_menu m where lower(m.product_name)=lower(p.name));

  if (select count(*) from public.products p join public.sales_categories c on c.id=p.sales_category_id
      where c.subunit_id=v_lovin_id and p.is_active and p.deleted_at is null) <> 43 then
    raise exception 'Active Lovin catalog did not reconcile to 43 products.';
  end if;
  if (select count(*) from public.sales_categories
      where subunit_id=v_lovin_id and is_active) <> 10 then
    raise exception 'Active Lovin categories did not reconcile to 10.';
  end if;
end $$;

insert into public.data_import_batches(
  batch_key, description, facts_period_start, facts_period_end, assets_full,
  status, source_manifest, expected_metrics, started_at, completed_at
) values (
  'LM-ACTUAL-JULY-2026-AGGREGATE',
  'Actual aggregate July 2026 revenue, visitor, known bill, and product quantity facts; no transaction composition or product financial facts.',
  date '2026-07-01', date '2026-07-31', false, 'importing',
  jsonb_build_object(
    'source_file','lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx',
    'source_type','aggregate_actual','transaction_composition_available',false,
    'product_revenue_available',false,'product_hpp_available',false,
    'lovin_2026_07_19_resolution','total_sales_minus_arayya'
  ),
  jsonb_build_object(
    'daily_sales_summaries',31,'revenue',23141159,'arayya_revenue',1893000,
    'lovin_raw_revenue',19978159,'lovin_resolved_revenue',21248159,
    'known_bill_count',318,'adult_visitors',335,'child_visitors',273,
    'traffic_total',608,'product_quantity',1122,'mapped_quantity',1116,
    'unmatched_quantity',6,'free_quantity',10
  ), clock_timestamp(), null
)
on conflict (batch_key) do update set
  description=excluded.description, facts_period_start=excluded.facts_period_start,
  facts_period_end=excluded.facts_period_end, status='importing',
  source_manifest=excluded.source_manifest, expected_metrics=excluded.expected_metrics,
  started_at=clock_timestamp(), completed_at=null, updated_at=clock_timestamp();

delete from public.historical_product_daily_quantities q using public.data_import_batches b
where q.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.historical_product_aliases a using public.data_import_batches b
where a.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.historical_products p using public.data_import_batches b
where p.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.customer_traffic_daily t using public.data_import_batches b
where t.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.daily_sales_summaries s using public.data_import_batches b
where s.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.data_coverage_periods c using public.data_import_batches b
where c.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.daily_sales_summaries(
  import_batch_id,source_key,sale_date,date_raw,bill_count,adult_visitors,
  child_visitors,visitor_total,total_sales,total_sales_arayya,total_sales_lovin,
  total_sales_lovin_raw,product_quantity_recorded,product_detail_available,
  source_notes,source_file,source_sheet,source_row,data_origin,data_entry_status
)
select b.id,'july-sales-'||to_char(s.sale_date,'YYYY-MM-DD'),s.sale_date,to_char(s.sale_date,'DD/MM/YYYY'),
  s.bill_count,s.adult_visitors,s.child_visitors,s.visitor_total,s.total_sales,
  s.arayya_sales,s.lovin_resolved,s.lovin_raw,s.product_qty,s.product_detail_available,
  s.source_notes,'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx','Sales_Harian_Juli',
  extract(day from s.sale_date)::integer+1,'actual',
  case when s.bill_count is null and s.total_sales>0 then 'partial_bill_coverage'
       when not s.product_detail_available and s.total_sales>0 then 'partial_product_coverage'
       else 'recorded' end
from july_sales s cross join public.data_import_batches b
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.customer_traffic_daily(
  import_batch_id,source_key,traffic_date,adult_visitors,child_visitors,total_visitors,
  bill_count,source_file,source_sheet,source_row,data_origin
)
select b.id,'july-traffic-'||to_char(s.sale_date,'YYYY-MM-DD'),s.sale_date,
  s.adult_visitors,s.child_visitors,s.visitor_total,s.bill_count,
  'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx','Sales_Harian_Juli',
  extract(day from s.sale_date)::integer+1,'actual'
from july_sales s cross join public.data_import_batches b
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
  and s.adult_visitors is not null and s.child_visitors is not null and s.visitor_total is not null;

insert into public.historical_products(
  import_batch_id,historical_product_key,canonical_name,category_name,mapping_status,
  current_product_match_strategy,current_product_id
)
select b.id,'july-product-'||substr(md5(coalesce(m.final_name,m.raw_name)),1,20),
  coalesce(m.final_name,m.raw_name),max(m.category_name),
  case when max(m.mapping_status)='UNMATCHED_HISTORICAL' then 'unmatched_historical' else 'mapped_final_menu' end,
  case when max(m.mapping_status)='UNMATCHED_HISTORICAL' then null else 'staging_authoritative_mapping' end,
  max(p.id::text)::uuid
from july_mapping m cross join public.data_import_batches b
left join public.sales_categories c on lower(c.name)=lower(m.category_name)
left join public.business_subunits su on su.id=c.subunit_id and lower(su.name)='lovin milk'
left join public.products p on p.sales_category_id=c.id and lower(p.name)=lower(m.final_name) and su.id is not null
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
group by b.id,coalesce(m.final_name,m.raw_name)
on conflict (import_batch_id,historical_product_key) do nothing;

insert into public.historical_product_aliases(
  import_batch_id,historical_product_id,alias_key,alias_name,normalized_alias,
  spelling_normalized_alias,mapping_status,occurrence_count
)
select b.id,h.id,'july-alias-'||substr(md5(m.raw_name),1,20),m.raw_name,lower(btrim(m.raw_name)),
  lower(btrim(m.raw_name)),lower(m.mapping_status),count(q.raw_name)
from july_mapping m cross join public.data_import_batches b
join public.historical_products h on h.import_batch_id=b.id
 and h.canonical_name=coalesce(m.final_name,m.raw_name)
left join july_quantities q on q.raw_name=m.raw_name
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
group by b.id,h.id,m.raw_name,m.mapping_status;

insert into public.historical_product_daily_quantities(
  import_batch_id,historical_product_id,source_key,sale_date,canonical_product_name,
  category_name,quantity,is_free_menu,raw_variants,category_raw_variants,
  source_file,source_references,data_origin
)
select b.id,h.id,'july-qty-'||to_char(q.sale_date,'YYYY-MM-DD')||'-'||substr(md5(q.raw_name),1,16),
  q.sale_date,coalesce(q.final_name,q.raw_name),q.category_name,q.quantity,q.is_free,q.raw_name,
  q.category_name,'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx',
  'Qty_Produk_Juli; Mapping_Produk','actual'
from july_quantities q cross join public.data_import_batches b
join public.historical_products h on h.import_batch_id=b.id
 and h.canonical_name=coalesce(q.final_name,q.raw_name)
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.data_coverage_periods(import_batch_id,domain,period_start,period_end,availability_status,row_count,notes)
select id,v.domain,date '2026-07-01',date '2026-07-31',v.status,v.row_count,v.notes
from public.data_import_batches cross join (values
  ('outlet_revenue','available',31::bigint,'Daily actual aggregate; authoritative for Outlet revenue.'),
  ('subunit_revenue','available_with_one_derived_value',31::bigint,'Lovin 19 July resolved as total minus Arayya; raw value remains NULL.'),
  ('bill_count','partial',30::bigint,'9 July is NULL; monthly 318 means bills recorded, not proven full coverage.'),
  ('visitor_count','available',29::bigint,'608 visitors recorded.'),
  ('product_quantity','partial',391::bigint,'1,122 qty recorded; 30 July has no product detail; 6 qty unmatched.'),
  ('product_revenue','unavailable',0::bigint,'No item-level revenue source.'),
  ('transaction_composition','unavailable',0::bigint,'No individual bill/item composition source.'),
  ('july_financial_costs','unavailable',0::bigint,'No authoritative HPP/OPEX/depreciation source for July.')
) v(domain,status,row_count,notes)
where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

update public.data_import_batches set status='imported',completed_at=clock_timestamp(),updated_at=clock_timestamp()
where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

create or replace function public.get_july_actual_daily(p_start_date date,p_end_date date)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $$
  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'date',s.sale_date,'total_sales',s.total_sales,'lovin_sales',s.total_sales_lovin,
      'lovin_sales_raw',s.total_sales_lovin_raw,'arayya_sales',s.total_sales_arayya,
      'bill_count',s.bill_count,'adult_visitors',s.adult_visitors,'child_visitors',s.child_visitors,
      'visitor_total',s.visitor_total,'product_quantity',s.product_quantity_recorded,
      'product_detail_available',s.product_detail_available,'source_notes',s.source_notes
    ) order by s.sale_date),'[]'::jsonb),
    'known_bill_count',coalesce(sum(s.bill_count),0),'bill_coverage_complete',bool_and(s.bill_count is not null or s.total_sales=0),
    'product_detail_coverage_complete',bool_and(s.product_detail_available or s.total_sales=0),
    'transaction_composition_available',false,'product_financial_metrics_available',false,
    'july_financial_costs_available',false,'mapped_quantity',1116,'unmatched_quantity',6,'free_quantity',10
  ) from public.daily_sales_summaries s join public.data_import_batches b on b.id=s.import_batch_id
  where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE' and s.sale_date between p_start_date and p_end_date
$$;
revoke all on function public.get_july_actual_daily(date,date) from public,anon;
grant execute on function public.get_july_actual_daily(date,date) to authenticated;

do $$
declare v_batch uuid;
begin
  select id into strict v_batch from public.data_import_batches where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
  if (select sum(total_sales) from public.daily_sales_summaries where import_batch_id=v_batch)<>23141159
    or (select sum(total_sales_arayya) from public.daily_sales_summaries where import_batch_id=v_batch)<>1893000
    or (select sum(total_sales_lovin) from public.daily_sales_summaries where import_batch_id=v_batch)<>21248159
    or (select sum(adult_visitors) from public.daily_sales_summaries where import_batch_id=v_batch)<>335
    or (select sum(child_visitors) from public.daily_sales_summaries where import_batch_id=v_batch)<>273
    or (select sum(quantity) from public.historical_product_daily_quantities where import_batch_id=v_batch)<>1122
    or (select bill_count from public.daily_sales_summaries where import_batch_id=v_batch and sale_date='2026-07-09') is not null
    or (select product_detail_available from public.daily_sales_summaries where import_batch_id=v_batch and sale_date='2026-07-30') then
    raise exception 'Final July import reconciliation failed.';
  end if;
end $$;

commit;
