DO $$
DECLARE
  tipo_f_id UUID;
  car_price NUMERIC(10,2);
BEGIN
  SELECT price INTO car_price
  FROM courses
  WHERE active=TRUE
    AND (LOWER(name) LIKE '%clase b%' OR LOWER(name) LIKE '%autom%')
  ORDER BY CASE WHEN LOWER(name) LIKE '%clase b%' THEN 0 ELSE 1 END
  LIMIT 1;

  IF car_price IS NULL THEN
    RAISE EXCEPTION 'No existe un curso activo de Clase B para obtener el precio de Tipo F';
  END IF;

  SELECT id INTO tipo_f_id FROM courses WHERE LOWER(name)='tipo f' LIMIT 1;
  IF tipo_f_id IS NULL THEN
    INSERT INTO courses(name,description,price,active)
    VALUES('Tipo F','Licencia Tipo F para personas con discapacidad',car_price,TRUE)
    RETURNING id INTO tipo_f_id;
  ELSE
    UPDATE courses
    SET price=car_price,active=TRUE,description='Licencia Tipo F para personas con discapacidad',updated_at=NOW()
    WHERE id=tipo_f_id;
  END IF;

  INSERT INTO branch_courses(branch_id,course_id,active)
  SELECT DISTINCT bc.branch_id,tipo_f_id,TRUE
  FROM branch_courses bc
  JOIN courses car ON car.id=bc.course_id
  WHERE bc.active=TRUE AND car.active=TRUE
    AND (LOWER(car.name) LIKE '%clase b%' OR LOWER(car.name) LIKE '%autom%')
  ON CONFLICT(branch_id,course_id) DO UPDATE SET active=TRUE,updated_at=NOW();

  INSERT INTO instructor_course_capabilities(instructor_id,course_id,active)
  SELECT DISTINCT capability.instructor_id,tipo_f_id,TRUE
  FROM instructor_course_capabilities capability
  JOIN courses car ON car.id=capability.course_id
  WHERE capability.active=TRUE AND car.active=TRUE
    AND (LOWER(car.name) LIKE '%clase b%' OR LOWER(car.name) LIKE '%autom%')
  ON CONFLICT(instructor_id,course_id) DO UPDATE SET active=TRUE;
END $$;

INSERT INTO document_types(code,name,required,active)
VALUES('certificado_discapacidad','Certificado de discapacidad',FALSE,TRUE)
ON CONFLICT(code) WHERE code IS NOT NULL DO UPDATE
SET name=EXCLUDED.name,active=TRUE;
