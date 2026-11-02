"""Build topic-specific recall checks from the authored CCNA book scenarios.

The book's legacy multiple-choice distractors mix unrelated chapters. These short
self-checks reuse each lesson's own problem, steps, and verification evidence.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'src/content/books/ccna-v8.1.json').read_text())
by_id = {lesson['id']: lesson for lesson in source['lessons']}
checks = {}

for lesson in source['lessons']:
    lesson_id = lesson['id']
    teaching = lesson.get('teaching') or {}
    guide = lesson.get('teachingGuide') or {}
    depth = lesson.get('depthV8') or {}
    steps = [step['text'].strip() for step in teaching.get('steps', [])]
    if teaching.get('problem') and len(steps) >= 2:
        problem = teaching['problem'].strip()
        checks[lesson_id] = [
            {
                'prompt': f'{problem} What is the first useful step or decision, and why?',
                'beginnerAnswer': steps[0],
                'technicalAnswer': ' '.join([steps[0], teaching.get('method', '')]).strip(),
            },
            {
                'prompt': f'{problem} After the first check, what would you do next and what result would you expect?',
                'beginnerAnswer': ' '.join(steps[1:] + [teaching.get('result', '')]).strip(),
                'technicalAnswer': ' '.join(steps[1:] + [teaching.get('verify', '')]).strip(),
            },
            {
                'prompt': f'{problem} What common mistake could mislead your conclusion, and how would you check it?',
                'beginnerAnswer': ' '.join(filter(None, [guide.get('commonTrap'), teaching.get('result')])).strip(),
                'technicalAnswer': ' '.join(filter(None, [depth.get('commonError'), teaching.get('verify')])).strip(),
            },
        ]
    else:
        chapter = next(c for c in source['chapters'] if c['id'] == lesson['chapterId'])
        examples = [by_id[id] for id in chapter['lessonIds'] if by_id[id].get('teaching')]
        if lesson_id == '21.05':
            examples = [by_id[id] for id in ('4.01', '7.01', '8.04', '10.04', '13.01', '17.01', '20.01')]
        elif examples:
            examples = [examples[0], examples[len(examples) // 2], examples[-1]]
            chapter_index = source['chapters'].index(chapter)
            if chapter_index:
                previous = source['chapters'][chapter_index - 1]
                previous_examples = [by_id[id] for id in previous['lessonIds'] if by_id[id].get('teaching')]
                if previous_examples:
                    examples.append(previous_examples[len(previous_examples) // 2])
        checks[lesson_id] = [
            {
                'prompt': f'{example["teaching"]["problem"]} Walk through the important steps or decisions and how you would verify the conclusion.',
                'beginnerAnswer': ' '.join(s['text'] for s in example['teaching']['steps']) + ' ' + example['teaching'].get('result', ''),
                'technicalAnswer': ' '.join(s['text'] for s in example['teaching']['steps']) + ' ' + example['teaching'].get('verify', ''),
            }
            for example in examples
        ]

assert len(checks) == len(source['lessons']) == 233
assert all(len(items) >= 3 and all(item['prompt'] and item['beginnerAnswer'] and item['technicalAnswer'] for item in items) for items in checks.values())
output = ROOT / 'src/content/books/ccna-recall-v9.json'
output.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
print(f'Wrote {len(checks)} lesson checks ({sum(map(len, checks.values()))} prompts) to {output}')
