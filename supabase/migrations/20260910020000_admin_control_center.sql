-- Master Admin Control Center: Dynamic Buttons, Sections, Lines, Locations & Feature Toggles
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS custom_buttons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS production_lines JSONB DEFAULT '["خط بسكويت ويفر (Wafer Line)", "خط صب الشوكولاتة والبارات (Moulding Line)", "خط الكريمات والحشوات (Creams & Fillings)", "خط التعبئة والتغليف (Packaging Line)", "معمل الجودة والتطوير (QC Lab / R&D)"]'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS storage_locations JSONB DEFAULT '["ثلاجة الشوكولاتة 18°C (Chocolate Cool Store)", "مخزن الدقيق والنواشف 72% (Flour Warehouse)", "صومعة السكر والنشا (Sugar Silo)", "مستودع المنكهات والدهون النباتية (Fats & Flavors)", "غرفة مواد التعبئة والتغليف (Packaging Store)", "منطقة الحجر المؤقت (Quarantine Bay)"]'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{"enable_kpis": true, "enable_dispense": true, "enable_waste_prevention": true, "enable_monthly_audit": true, "enable_barcode_scanner": true, "allow_export_non_admin": true}'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS factory_name TEXT DEFAULT 'Vienna';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS system_tagline TEXT DEFAULT 'Factory Batch Watch & Expiry Guard';

-- Ensure defaults on existing singleton row if NULL
UPDATE public.app_settings
SET
  custom_buttons = COALESCE(custom_buttons, '[]'::jsonb),
  production_lines = COALESCE(production_lines, '["خط بسكويت ويفر (Wafer Line)", "خط صب الشوكولاتة والبارات (Moulding Line)", "خط الكريمات والحشوات (Creams & Fillings)", "خط التعبئة والتغليف (Packaging Line)", "معمل الجودة والتطوير (QC Lab / R&D)"]'::jsonb),
  storage_locations = COALESCE(storage_locations, '["ثلاجة الشوكولاتة 18°C (Chocolate Cool Store)", "مخزن الدقيق والنواشف 72% (Flour Warehouse)", "صومعة السكر والنشا (Sugar Silo)", "مستودع المنكهات والدهون النباتية (Fats & Flavors)", "غرفة مواد التعبئة والتغليف (Packaging Store)", "منطقة الحجر المؤقت (Quarantine Bay)"]'::jsonb),
  feature_flags = COALESCE(feature_flags, '{"enable_kpis": true, "enable_dispense": true, "enable_waste_prevention": true, "enable_monthly_audit": true, "enable_barcode_scanner": true, "allow_export_non_admin": true}'::jsonb),
  factory_name = COALESCE(factory_name, 'Vienna'),
  system_tagline = COALESCE(system_tagline, 'Factory Batch Watch & Expiry Guard')
WHERE id = true;
