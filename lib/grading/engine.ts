export type SelectionMethod = 'best_n' | 'all_subjects' | 'compulsory_plus_best_optional' | 'manual';
export type OverallStatus = 'Pass' | 'Fail' | 'Incomplete' | 'Absent' | 'Not Classified';

export interface GradeRange {
  grade: string;
  minMark: number;
  maxMark: number;
  point: number;
  remark: string;
  passed: boolean;
  order: number;
}

export interface GradingSchemeConfig {
  maximumMark: number;
  minimumPassMark: number;
  ranges: GradeRange[];
  coverageRequired?: boolean;
}

export interface DivisionRange {
  division: string;
  minAggregate: number;
  maxAggregate: number | null;
  passed: boolean;
  remark: string;
  order: number;
}

export interface DivisionSchemeConfig {
  subjectsUsed: number;
  minimumSubjectsRequired: number;
  maximumSubjectsAllowed: number;
  selectionMethod: SelectionMethod;
  compulsorySubjectIds: string[];
  excludedSubjectIds: string[];
  includeSubsidiarySubjects: boolean;
  allowFailedSubjects: boolean;
  compulsoryMustPass: boolean;
  failedCompulsoryFailsOverall: boolean;
  divisionZeroOnFailure: boolean;
  ranges: DivisionRange[];
  minimumPassedSubjects: number;
  maximumFailedSubjects: number;
  absentStatus: 'Absent' | 'Incomplete';
  missingMarksStatus: 'Incomplete' | 'Not Classified';
  includeCompulsory?: boolean;
  rankingMethod?: 'aggregate' | 'total_marks' | 'average_mark';
}

export interface SubjectMarkInput {
  subjectId: string;
  subjectName?: string;
  mark: number | null;
  absent?: boolean;
  subsidiary?: boolean;
  manuallySelected?: boolean;
}

export interface CalculatedSubject {
  subjectId: string;
  subjectName?: string;
  mark: number | null;
  grade: string | null;
  point: number | null;
  remark: string | null;
  passed: boolean | null;
  includedInDivision: boolean;
  absent: boolean;
}

export interface CalculatedResult {
  subjects: CalculatedSubject[];
  totalMarks: number | null;
  averageMark: number | null;
  passedSubjects: number;
  failedSubjects: number;
  selectedSubjectIds: string[];
  aggregate: number | null;
  division: DivisionRange | null;
  overallStatus: OverallStatus;
  overallRemark: string | null;
}

export function validateGradeRanges(config: GradingSchemeConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.maximumMark) || config.maximumMark <= 0) errors.push('Maximum mark must be greater than zero.');
  if (!Number.isFinite(config.minimumPassMark) || config.minimumPassMark < 0 || config.minimumPassMark > config.maximumMark) errors.push('Minimum pass mark must be between zero and the maximum mark.');
  const ranges = [...config.ranges].sort((a, b) => a.minMark - b.minMark || a.order - b.order);
  for (const range of ranges) {
    if (range.minMark < 0) errors.push(`Grade ${range.grade} cannot have a negative minimum mark.`);
    if (range.minMark > range.maxMark) errors.push(`Grade ${range.grade} has an invalid range.`);
    if (range.maxMark > config.maximumMark) errors.push(`Grade ${range.grade} exceeds the scheme maximum mark.`);
    if (range.point < 0 || !Number.isFinite(range.point)) errors.push(`Grade ${range.grade} has an invalid grade point.`);
  }
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]!;
    const current = ranges[index]!;
    if (current.minMark <= previous.maxMark) errors.push(`Grade ranges ${previous.grade} and ${current.grade} overlap.`);
    else if (config.coverageRequired !== false && current.minMark !== previous.maxMark + 1) errors.push(`Grade ranges ${previous.grade} and ${current.grade} have a gap.`);
  }
  if (config.coverageRequired !== false && ranges.length && (ranges[0]!.minMark !== 0 || ranges[ranges.length - 1]!.maxMark !== config.maximumMark)) errors.push(`Grade ranges must cover every mark from 0 to ${config.maximumMark}.`);
  const duplicateGrades = new Set<string>();
  for (const range of ranges) {
    const key = range.grade.trim().toLowerCase();
    if (duplicateGrades.has(key)) errors.push(`Grade ${range.grade} is duplicated.`);
    duplicateGrades.add(key);
  }
  return errors;
}

export function validateDivisionRanges(config: DivisionSchemeConfig): string[] {
  const errors: string[] = [];
  if (config.minimumSubjectsRequired < 1) errors.push('Minimum subjects required must be at least one.');
  if (config.maximumSubjectsAllowed < config.minimumSubjectsRequired) errors.push('Maximum subjects allowed cannot be below the minimum.');
  if (config.subjectsUsed < config.minimumSubjectsRequired || config.subjectsUsed > config.maximumSubjectsAllowed) errors.push('Subjects used must be within the configured subject limits.');
  const ranges = [...config.ranges].sort((a, b) => a.minAggregate - b.minAggregate || a.order - b.order);
  if (!ranges.length) return errors;
  if (ranges[0]!.minAggregate !== 0) errors.push('Division ranges must cover every aggregate from 0 upward.');
  for (const range of ranges) {
    if (range.minAggregate < 0) errors.push(`Division ${range.division} cannot have a negative minimum aggregate.`);
    if (range.maxAggregate !== null && range.maxAggregate < range.minAggregate) errors.push(`Division ${range.division} has an invalid aggregate range.`);
  }
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]!;
    const current = ranges[index]!;
    if (previous.maxAggregate === null) {
      if (index !== ranges.length - 1) errors.push('The catch-all division band must be the last range.');
    } else if (current.minAggregate !== previous.maxAggregate + 1) {
      errors.push(`Division ranges ${previous.division} and ${current.division} have a gap.`);
    }
    if (previous.maxAggregate !== null && current.minAggregate <= previous.maxAggregate) {
      errors.push(`Division ranges ${previous.division} and ${current.division} overlap.`);
    }
  }
  const duplicateDivisions = new Set<string>();
  for (const range of ranges) {
    const key = range.division.trim().toLowerCase();
    if (duplicateDivisions.has(key)) errors.push(`Division ${range.division} is duplicated.`);
    duplicateDivisions.add(key);
  }
  return errors;
}

export function calculateResult(grading: GradingSchemeConfig, division: DivisionSchemeConfig, inputs: SubjectMarkInput[]): CalculatedResult {
  const rangeErrors = validateGradeRanges(grading);
  const divisionErrors = validateDivisionRanges(division).filter((message) => !message.toLowerCase().includes('cover'));
  if (rangeErrors.length || divisionErrors.length) throw new Error([...rangeErrors, ...divisionErrors].join(' '));

  const rankingMethod = division.rankingMethod ?? 'aggregate';
  const sortedGradeRanges = [...grading.ranges].sort((a, b) => a.minMark - b.minMark || a.order - b.order);
  const sortedDivisionRanges = [...division.ranges].sort((a, b) => a.minAggregate - b.minAggregate || a.order - b.order);
  const subjects = inputs.map((input): CalculatedSubject => {
    const absent = input.absent === true;
    if (absent || input.mark === null || input.mark === undefined) return { subjectId: input.subjectId, subjectName: input.subjectName, mark: input.mark, grade: null, point: null, remark: null, passed: null, includedInDivision: false, absent };
    if (!Number.isFinite(input.mark) || input.mark < 0 || input.mark > grading.maximumMark) throw new Error(`Mark for ${input.subjectName ?? input.subjectId} must be between 0 and ${grading.maximumMark}.`);
    const range = sortedGradeRanges.find((candidate) => input.mark! >= candidate.minMark && input.mark! <= candidate.maxMark);
    if (!range) throw new Error(`No grading range has been configured for mark ${input.mark}.`);
    return { subjectId: input.subjectId, subjectName: input.subjectName, mark: input.mark, grade: range.grade, point: range.point, remark: range.remark, passed: range.passed && input.mark >= grading.minimumPassMark, includedInDivision: false, absent: false };
  });

  const missing = subjects.some((subject) => subject.mark === null && !subject.absent);
  const absent = subjects.length > 0 && subjects.every((subject) => subject.absent);
  const eligible = subjects.filter((subject) => subject.point !== null && !division.excludedSubjectIds.includes(subject.subjectId) && (division.includeSubsidiarySubjects || !inputs.find((input) => input.subjectId === subject.subjectId)?.subsidiary) && (division.allowFailedSubjects || subject.passed));
  const compulsory = eligible.filter((subject) => division.compulsorySubjectIds.includes(subject.subjectId));
  const optional = eligible.filter((subject) => !division.compulsorySubjectIds.includes(subject.subjectId)).sort((a, b) => (a.point ?? 0) - (b.point ?? 0));
  let selected = subjects.filter((subject) => subject.point !== null && subject.mark !== null && (inputs.find((input) => input.subjectId === subject.subjectId)?.manuallySelected === true));
  if (division.selectionMethod === 'all_subjects') selected = eligible;
  if (division.selectionMethod === 'best_n') selected = eligible.sort((a, b) => (a.point ?? 0) - (b.point ?? 0)).slice(0, division.subjectsUsed);
  if (division.selectionMethod === 'compulsory_plus_best_optional') {
    const selectedOptional = optional.slice(0, Math.max(0, division.subjectsUsed - compulsory.length));
    selected = [...compulsory, ...selectedOptional];
  }
  if (division.includeCompulsory === false) selected = selected.filter((subject) => !division.compulsorySubjectIds.includes(subject.subjectId));
  selected = selected.slice(0, division.maximumSubjectsAllowed);
  const selectedIds = new Set(selected.map((subject) => subject.subjectId));
  for (const subject of subjects) subject.includedInDivision = selectedIds.has(subject.subjectId);

  const passedSubjects = subjects.filter((subject) => subject.passed === true).length;
  const failedSubjects = subjects.filter((subject) => subject.passed === false).length;
  const compulsoryFailed = subjects.some((subject) => division.compulsorySubjectIds.includes(subject.subjectId) && subject.passed === false);
  const incomplete = missing || selected.length < division.minimumSubjectsRequired;
  const aggregate = selected.length ? selected.reduce((total, subject) => total + (subject.point ?? 0), 0) : null;
  const selectedMarksComplete = selected.length > 0 && selected.every((subject) => subject.mark !== null);
  const selectedTotalMarks = selectedMarksComplete ? selected.reduce((total, subject) => total + Number(subject.mark ?? 0), 0) : null;
  const selectedAverageMark = selectedTotalMarks === null ? null : selectedTotalMarks / selected.length;
  const rankingValue = rankingMethod === 'total_marks' ? selectedTotalMarks : rankingMethod === 'average_mark' ? selectedAverageMark : aggregate;
  const divisionRange = aggregate === null ? null : sortedDivisionRanges.find((range) => aggregate >= range.minAggregate && (range.maxAggregate === null || aggregate <= range.maxAggregate)) ?? null;
  let overallStatus: OverallStatus = 'Pass';
  if (absent) overallStatus = division.absentStatus;
  else if (incomplete) overallStatus = division.missingMarksStatus;
  else if (divisionRange === null) overallStatus = 'Not Classified';
  else if (compulsoryFailed && (division.compulsoryMustPass || division.failedCompulsoryFailsOverall)) overallStatus = 'Fail';
  else if (passedSubjects < division.minimumPassedSubjects || failedSubjects > division.maximumFailedSubjects || !divisionRange.passed) overallStatus = 'Fail';
  if (overallStatus === 'Fail' && division.divisionZeroOnFailure) {
    const zero = division.ranges.find((range) => range.division.toLowerCase().includes('0'));
    if (zero) return { subjects, totalMarks: selectedTotalMarks, averageMark: selectedAverageMark, passedSubjects, failedSubjects, selectedSubjectIds: [...selectedIds], aggregate, division: zero, overallStatus, overallRemark: zero.remark };
  }
  return { subjects, totalMarks: selectedTotalMarks, averageMark: selectedAverageMark, passedSubjects, failedSubjects, selectedSubjectIds: [...selectedIds], aggregate, division: divisionRange, overallStatus, overallRemark: divisionRange?.remark ?? null };
}

export function rankingSortValue(result: Pick<CalculatedResult, 'aggregate' | 'totalMarks' | 'averageMark'>, method: 'aggregate' | 'total_marks' | 'average_mark' = 'aggregate'): number | null {
  if (method === 'total_marks') return result.totalMarks ?? null;
  if (method === 'average_mark') return result.averageMark ?? null;
  return result.aggregate ?? null;
}

