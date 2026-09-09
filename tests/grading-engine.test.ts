import assert from 'node:assert/strict';
import { calculateResult, validateDivisionRanges, validateGradeRanges, type DivisionSchemeConfig, type GradingSchemeConfig } from '../lib/grading/engine';

const grading: GradingSchemeConfig = {
  maximumMark: 100,
  minimumPassMark: 40,
  ranges: [
    { minMark: 0, maxMark: 39, grade: 'F', point: 0, remark: 'Fail', passed: false, order: 0 },
    { minMark: 40, maxMark: 49, grade: 'E', point: 5, remark: 'Pass', passed: true, order: 1 },
    { minMark: 50, maxMark: 59, grade: 'D', point: 4, remark: 'Satisfactory', passed: true, order: 2 },
    { minMark: 60, maxMark: 69, grade: 'C', point: 3, remark: 'Good', passed: true, order: 3 },
    { minMark: 70, maxMark: 79, grade: 'B', point: 2, remark: 'Very Good', passed: true, order: 4 },
    { minMark: 80, maxMark: 100, grade: 'A', point: 1, remark: 'Excellent', passed: true, order: 5 },
  ],
};

const division: DivisionSchemeConfig = {
  subjectsUsed: 3,
  minimumSubjectsRequired: 3,
  maximumSubjectsAllowed: 3,
  selectionMethod: 'best_n',
  compulsorySubjectIds: ['math'],
  excludedSubjectIds: [],
  includeSubsidiarySubjects: true,
  allowFailedSubjects: true,
  compulsoryMustPass: true,
  failedCompulsoryFailsOverall: true,
  divisionZeroOnFailure: false,
  ranges: [{ division: 'Division I', minAggregate: 3, maxAggregate: 6, passed: true, remark: 'Excellent', order: 0 }, { division: 'Division II', minAggregate: 7, maxAggregate: 12, passed: true, remark: 'Very Good', order: 1 }],
  minimumPassedSubjects: 2,
  maximumFailedSubjects: 1,
  absentStatus: 'Absent',
  missingMarksStatus: 'Incomplete',
};

for (const [mark, grade] of [[39, 'F'], [40, 'E'], [49, 'E'], [50, 'D'], [59, 'D'], [60, 'C'], [69, 'C'], [70, 'B'], [79, 'B'], [80, 'A'], [100, 'A']] as const) {
  const result = calculateResult(grading, { ...division, subjectsUsed: 1, minimumSubjectsRequired: 1, maximumSubjectsAllowed: 1, selectionMethod: 'all_subjects', compulsorySubjectIds: [], ranges: [{ division: 'Division I', minAggregate: 0, maxAggregate: null, passed: true, remark: 'Pass', order: 0 }] }, [{ subjectId: 'subject', mark }]);
  assert.equal(result.subjects[0]?.grade, grade, `mark ${mark}`);
}

assert.ok(validateGradeRanges({ ...grading, ranges: [{ ...grading.ranges[0]!, maxMark: 50 }, { ...grading.ranges[1]!, minMark: 40 }] }).some((message) => message.includes('overlap')));
assert.ok(validateGradeRanges({ ...grading, ranges: [{ ...grading.ranges[0]!, maxMark: 38 }] }).some((message) => message.includes('cover')));
assert.ok(validateDivisionRanges({ ...division, ranges: [{ ...division.ranges[0]!, minAggregate: 3, maxAggregate: 6 }, { ...division.ranges[1]!, minAggregate: 7, maxAggregate: 12 }] }).some((message) => message.includes('cover')));
assert.ok(validateDivisionRanges({ ...division, ranges: [{ ...division.ranges[0]!, maxAggregate: 8 }, { ...division.ranges[1]!, minAggregate: 7 }] }).some((message) => message.includes('overlap')));
assert.ok(validateDivisionRanges({ ...division, ranges: [...division.ranges, { ...division.ranges[0]!, division: 'division i' }] }).some((message) => message.includes('duplicated')));

const rankingByAverage = calculateResult(grading, { ...division, rankingMethod: 'average_mark', subjectsUsed: 2, minimumSubjectsRequired: 2, maximumSubjectsAllowed: 2, selectionMethod: 'all_subjects', compulsorySubjectIds: [], excludedSubjectIds: [], ranges: [{ division: 'Division I', minAggregate: 0, maxAggregate: null, passed: true, remark: '', order: 0 }] }, [
  { subjectId: 'math', mark: 80 },
  { subjectId: 'english', mark: 70 },
]);
assert.equal(rankingByAverage.totalMarks, 150);
assert.equal(rankingByAverage.averageMark, 75);

assert.throws(() => calculateResult({ ...grading, maximumMark: 50, ranges: [{ grade: 'A', minMark: 0, maxMark: 50, point: 1, remark: 'Pass', passed: true, order: 0 }] }, { ...division, subjectsUsed: 1, minimumSubjectsRequired: 1, maximumSubjectsAllowed: 1, selectionMethod: 'all_subjects', compulsorySubjectIds: [], ranges: [{ division: 'Pass', minAggregate: 0, maxAggregate: null, passed: true, remark: '', order: 0 }] }, [{ subjectId: 'subject', mark: 51 }]), /between 0 and 50/);

const coreAndOptional = calculateResult(grading, {
  ...division,
  subjectsUsed: 3,
  minimumSubjectsRequired: 3,
  maximumSubjectsAllowed: 3,
  selectionMethod: 'compulsory_plus_best_optional',
  compulsorySubjectIds: ['math', 'english'],
  ranges: [{ division: 'Division I', minAggregate: 0, maxAggregate: null, passed: true, remark: '', order: 0 }],
}, [
  { subjectId: 'math', mark: 76 },
  { subjectId: 'english', mark: 83 },
  { subjectId: 'physics', mark: 68 },
  { subjectId: 'history', mark: 40 },
]);
assert.deepEqual([...coreAndOptional.selectedSubjectIds].sort(), ['english', 'math', 'physics']);
assert.equal(coreAndOptional.totalMarks, 227);
assert.equal(coreAndOptional.averageMark, 227 / 3);

const result = calculateResult(grading, division, [
  { subjectId: 'math', mark: 76 },
  { subjectId: 'english', mark: 83 },
  { subjectId: 'physics', mark: 68 },
  { subjectId: 'history', mark: 58 },
]);
assert.deepEqual([...result.selectedSubjectIds].sort(), ['english', 'math', 'physics']);
assert.equal(result.aggregate, 6);
assert.equal(result.division?.division, 'Division I');
assert.equal(result.overallStatus, 'Pass');

const incomplete = calculateResult(grading, division, [{ subjectId: 'math', mark: 76 }, { subjectId: 'english', mark: null }, { subjectId: 'physics', mark: 68 }]);
assert.equal(incomplete.overallStatus, 'Incomplete');

console.log('grading-engine tests passed');
