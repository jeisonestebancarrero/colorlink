-- ============================================================
-- Carta de color ampliada
-- ============================================================
-- La carta tenía 20 tonos. Para una marca de pinturas eso se ve escaso: quien
-- entra a «Encuentra tu color» a elegir para su casa asume que eso es todo lo
-- que se puede comprar, y se va.
--
-- Los códigos usan la serie PNT-1xxx, que estaba libre. Los originales andan
-- dispersos entre PNT-100 y PNT-915, y un primer intento reutilizó PNT-204
-- —que ya era «Almendra Suave»— y lo sobreescribió en silencio. Con una serie
-- propia, ampliar la carta no puede volver a pisar un tono ya publicado.
--
-- ADVERTENCIA: estos NO son los códigos oficiales de la carta Pintuco. Son
-- tonos reales y coherentes —el RGB se deriva del hexadecimal, no se teclea
-- aparte— con nombres en español apropiados para el mercado colombiano, para
-- que el cliente tenga de dónde escoger. Cuando Pintuco entregue su carta
-- oficial se reemplazan desde Administración → Catálogo → Colores. Los tonos
-- institucionales —azul #004F9F, amarillo #FFB81C, rojo #C8102E— sí son los
-- reales de la marca.

insert into public.colors (code, name, hex, rgb, family, is_palette, status) values
  ('PNT-1001', 'Blanco Lino', '#F7F4EE', '247, 244, 238', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1002', 'Blanco Perla', '#F2EFE9', '242, 239, 233', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1003', 'Blanco Algodón', '#FAF8F4', '250, 248, 244', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1004', 'Marfil Suave', '#F1E9D8', '241, 233, 216', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1005', 'Hueso Cálido', '#EDE4D3', '237, 228, 211', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1006', 'Niebla Matinal', '#E4E3DF', '228, 227, 223', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1007', 'Gris Perla', '#D8D6D1', '216, 214, 209', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1008', 'Gris Cemento', '#B9B7B2', '185, 183, 178', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1009', 'Gris Acero', '#9A9C9E', '154, 156, 158', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1010', 'Gris Grafito', '#6E7175', '110, 113, 117', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1011', 'Gris Carbón', '#4A4D51', '74, 77, 81', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1012', 'Humo', '#C6C3BC', '198, 195, 188', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1013', 'Arena Clara', '#E8DFCC', '232, 223, 204', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1014', 'Lino Crudo', '#E7E1D5', '231, 225, 213', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1015', 'Gris Concreto', '#8E8F8B', '142, 143, 139', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1016', 'Blanco Nube', '#F4F6F5', '244, 246, 245', 'Blancos & Neutros', true, 'ACTIVO'),
  ('PNT-1017', 'Beige Andino', '#E0CFB4', '224, 207, 180', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1018', 'Arena del Cauca', '#D6BE9B', '214, 190, 155', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1019', 'Trigo', '#CBAE7F', '203, 174, 127', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1020', 'Ocre Colonial', '#C08F4A', '192, 143, 74', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1021', 'Terracota', '#B5673F', '181, 103, 63', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1022', 'Barro Cocido', '#9C5334', '156, 83, 52', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1023', 'Canela', '#A9743F', '169, 116, 63', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1024', 'Café Guarapo', '#6F4A2F', '111, 74, 47', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1025', 'Chocolate', '#4F3524', '79, 53, 36', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1026', 'Durazno Suave', '#F0C9A6', '240, 201, 166', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1027', 'Melocotón', '#E8A87C', '232, 168, 124', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1028', 'Cobre', '#9E5B33', '158, 91, 51', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1029', 'Caramelo', '#C68B52', '198, 139, 82', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1030', 'Tabaco', '#7C5B3A', '124, 91, 58', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1031', 'Arcilla Roja', '#A45A45', '164, 90, 69', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1032', 'Miel', '#D9A45B', '217, 164, 91', 'Cálidos & Tierras', true, 'ACTIVO'),
  ('PNT-1033', 'Azul Cielo', '#CBDDEC', '203, 221, 236', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1034', 'Azul Bruma', '#A9C6DD', '169, 198, 221', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1035', 'Azul Caribe', '#5FA8C9', '95, 168, 201', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1036', 'Turquesa', '#3E9E9B', '62, 158, 155', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1037', 'Azul Pintuco', '#004F9F', '0, 79, 159', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1038', 'Azul Índigo', '#2A3D66', '42, 61, 102', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1039', 'Azul Noche', '#1B2A44', '27, 42, 68', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1040', 'Aguamarina', '#8FC9C4', '143, 201, 196', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1041', 'Azul Acero', '#6C7F94', '108, 127, 148', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1042', 'Petróleo', '#28454F', '40, 69, 79', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1043', 'Azul Lavanda', '#B8BFDC', '184, 191, 220', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1044', 'Celeste Pastel', '#DCE9F2', '220, 233, 242', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1045', 'Azul Marino', '#1F3557', '31, 53, 87', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1046', 'Azul Denim', '#4A6D96', '74, 109, 150', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1047', 'Menta Fría', '#D3E7E4', '211, 231, 228', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1048', 'Azul Cobalto', '#2D5FA8', '45, 95, 168', 'Azules & Frescos', true, 'ACTIVO'),
  ('PNT-1049', 'Verde Menta', '#CFE3D4', '207, 227, 212', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1050', 'Verde Salvia', '#A9BFA6', '169, 191, 166', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1051', 'Verde Oliva', '#7C8A5A', '124, 138, 90', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1052', 'Verde Musgo', '#5C6B45', '92, 107, 69', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1053', 'Verde Selva', '#2F4B34', '47, 75, 52', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1054', 'Verde Esmeralda', '#2E7D5B', '46, 125, 91', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1055', 'Verde Limón', '#C3D06A', '195, 208, 106', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1056', 'Verde Cafetal', '#6B7F4E', '107, 127, 78', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1057', 'Verde Agua', '#BEDCD6', '190, 220, 214', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1058', 'Verde Pino', '#3A5A46', '58, 90, 70', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1059', 'Verde Helecho', '#6F9367', '111, 147, 103', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1060', 'Verde Bambú', '#9FB37A', '159, 179, 122', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1061', 'Verde Jade', '#4F8F72', '79, 143, 114', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1062', 'Verde Militar', '#55603F', '85, 96, 63', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1063', 'Verde Pistacho', '#C7D6A0', '199, 214, 160', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1064', 'Verde Andino', '#417A5A', '65, 122, 90', 'Verdes & Naturales', true, 'ACTIVO'),
  ('PNT-1065', 'Amarillo Pintuco', '#FFB81C', '255, 184, 28', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1066', 'Amarillo Sol', '#F5C842', '245, 200, 66', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1067', 'Mostaza', '#D6A032', '214, 160, 50', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1068', 'Naranja Vivo', '#E86A1C', '232, 106, 28', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1069', 'Mandarina', '#F08A3C', '240, 138, 60', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1070', 'Rojo Pintuco', '#C8102E', '200, 16, 46', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1071', 'Rojo Teja', '#A83B2C', '168, 59, 44', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1072', 'Vino Tinto', '#6E2233', '110, 34, 51', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1073', 'Fucsia', '#B93B77', '185, 59, 119', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1074', 'Rosa Palo', '#E0B3B8', '224, 179, 184', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1075', 'Morado Real', '#5B2C8D', '91, 44, 141', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1076', 'Violeta Suave', '#9B84BF', '155, 132, 191', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1077', 'Coral', '#E7735C', '231, 115, 92', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1078', 'Magenta', '#A8306B', '168, 48, 107', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1079', 'Lila', '#C3AEDA', '195, 174, 218', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1080', 'Cereza', '#96243B', '150, 36, 59', 'Vibrantes & Acentos', true, 'ACTIVO'),
  ('PNT-1081', 'Arcilla Serena', '#C9A38C', '201, 163, 140', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1082', 'Verde Eucalipto', '#8FA894', '143, 168, 148', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1083', 'Azul Profundo', '#33506B', '51, 80, 107', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1084', 'Nube Cálida', '#EFE7DC', '239, 231, 220', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1085', 'Café Espresso', '#43312A', '67, 49, 42', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1086', 'Coral Suave', '#E5876F', '229, 135, 111', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1087', 'Verde Bosque', '#3D5A4B', '61, 90, 75', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1088', 'Beige Nórdico', '#DCD3C4', '220, 211, 196', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1089', 'Gris Lino', '#B5AFA4', '181, 175, 164', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1090', 'Terracota Suave', '#C98166', '201, 129, 102', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1091', 'Azul Sereno', '#7E9BB5', '126, 155, 181', 'Tendencias 2025', true, 'ACTIVO'),
  ('PNT-1092', 'Ocre Tostado', '#B8874E', '184, 135, 78', 'Tendencias 2025', true, 'ACTIVO')
on conflict (code) do nothing;
