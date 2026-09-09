export function rankResults(results: any[]) {
  const byExam = new Map<string, any[]>();
  for (const result of results) {
    const examId = result.examination_id;
    const groupKey = `${examId}:${result.class_id ?? 'unassigned'}`;
    byExam.set(groupKey, [...(byExam.get(groupKey) ?? []), result]);
  }
  for (const examResults of byExam.values()) {
    examResults.sort((left, right) => {
      if (left.aggregate === null && right.aggregate !== null) return 1;
      if (left.aggregate !== null && right.aggregate === null) return -1;
      const leftScore = left.ranking_value ?? left.aggregate;
      const rightScore = right.ranking_value ?? right.aggregate;
      return Number(leftScore ?? Number.MAX_SAFE_INTEGER) - Number(rightScore ?? Number.MAX_SAFE_INTEGER);
    });
    let previousAggregate: number | null = null;
    let previousPosition = 0;
    examResults.forEach((result, index) => {
      const aggregate = result.aggregate === null ? null : Number(result.aggregate);
      const position = aggregate === null ? null : aggregate === previousAggregate ? previousPosition : index + 1;
      result.position = position;
      previousAggregate = aggregate;
      if (position !== null) previousPosition = position;
    });
  }
  return results;
}

export function summarizeResults(results: any[]) {
  const classified = results.filter((result) => result.overall_status === 'Pass' || result.overall_status === 'Fail');
  const incomplete = results.filter((result) => result.overall_status === 'Incomplete').length;
  const absent = results.filter((result) => result.overall_status === 'Absent').length;
  const entered = results.filter((result) => Number(result.subject_count ?? 0) > 0).length;
  const averageMarks = results.filter((result) => result.average_mark !== null && result.average_mark !== undefined);
  const divisions = new Map<string, number>();
  for (const result of results) if (result.division) divisions.set(result.division, (divisions.get(result.division) ?? 0) + 1);
  return {
    students: new Set(results.map((result) => result.student_id)).size,
    exams: new Set(results.map((result) => result.examination_id)).size,
    passRate: classified.length ? Math.round((classified.filter((result) => result.overall_status === 'Pass').length / classified.length) * 100) : 0,
    average: averageMarks.length ? Math.round((averageMarks.reduce((total, result) => total + Number(result.average_mark), 0) / averageMarks.length) * 100) / 100 : null,
    incomplete,
    absent,
    completionRate: results.length ? Math.round((entered / results.length) * 100) : 0,
    highestAverage: averageMarks.length ? Math.max(...averageMarks.map((result) => Number(result.average_mark))) : null,
    divisions: [...divisions.entries()].sort((left, right) => right[1] - left[1]),
  };
}
