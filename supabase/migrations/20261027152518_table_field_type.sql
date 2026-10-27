-- Campo tabela: texto livre, com linhas pré-preenchidas e linhas/colunas extras na resposta.

alter table public.cl_form_fields
  drop constraint if exists cl_form_fields_type_check;

alter table public.cl_form_fields
  add constraint cl_form_fields_type_check
  check (type in (
    'text','textarea','checkbox','select','radio','date','number','image',
    'checkbox_group','info','table'
  ));
