drop policy if exists fee_structure_items_select on fee_structure_items;
create policy fee_structure_items_select on fee_structure_items
  for select using (
    school_id = current_school_id()
    and (
      has_permission('view_finance')
      or has_permission('view_financial_statements')
      or has_permission('manage_fee_structures')
      or has_permission('create_student_charges')
    )
  );

drop policy if exists fee_structures_select on fee_structures;
create policy fee_structures_select on fee_structures
  for select using (
    school_id = current_school_id()
    and (
      has_permission('view_finance')
      or has_permission('view_financial_statements')
      or has_permission('manage_fee_structures')
      or has_permission('create_student_charges')
    )
  );