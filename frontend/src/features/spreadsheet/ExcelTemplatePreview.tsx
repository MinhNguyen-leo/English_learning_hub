import { fieldNames, fields } from '../vocabulary/model'
import { templateExamples } from './template'

export function ExcelTemplatePreview() {
  return (
    <section
      id="excel-template-preview"
      className="excel-template-preview"
      aria-labelledby="template-preview-heading"
    >
      <div className="template-preview-heading">
        <span className="template-file-icon" aria-hidden="true">
          X
        </span>
        <div>
          <h3 id="template-preview-heading">Excel template preview</h3>
          <p>Vocabulary · first worksheet · 8 columns</p>
        </div>
      </div>
      <p>
        Put these headers in row 1, then add one vocabulary entry per row. Word
        and at least one English or Vietnamese meaning are required. All other
        cells may be left blank. Format cells as Text; do not use formulas.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Excel template example"
        tabIndex={0}
      >
        <table>
          <caption>
            Example worksheet — scroll horizontally to see all eight columns
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-label="Worksheet row">
                #
              </th>
              {fieldNames.map((key) => (
                <th scope="col" key={key}>
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templateExamples.map((row, index) => (
              <tr key={row.word}>
                <th scope="row">{index + 2}</th>
                {fieldNames.map((key) => (
                  <td key={key}>{row[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="template-column-guide">
        {fieldNames.map((key) => (
          <div key={key}>
            <dt>{fields[key].label}</dt>
            <dd>
              {key === 'word'
                ? 'Required'
                : key === 'english_meaning' || key === 'vietnamese_meaning'
                  ? 'At least one meaning'
                  : 'Optional'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="template-safety-note">
        These are example words only. Previewing or downloading this template
        does not add words to your library.
      </p>
    </section>
  )
}
